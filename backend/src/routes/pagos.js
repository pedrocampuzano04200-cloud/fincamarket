// Ruta: backend/src/routes/pagos.js
// Registro y anulación de pagos sobre las cuentas de cobro de un cierre.
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { validate, z, idParam, optId, optStr, fechaISO, optFecha } = require('../middleware/validate');
const { audit, notFound, HttpError, round2, fmtMoney } = require('../utils/helpers');

const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'OTRO'];

router.get('/', validate(z.object({
  desde: optFecha, hasta: optFecha, cierre_id: optId, apartamento_id: optId, unidad_id: optId,
  incluir_anulados: z.enum(['0', '1']).optional(),
}), 'query'), async (req, res) => {
  const f = req.valid.query;
  const where = []; const params = [];
  if (f.desde) { where.push('pg.fecha >= ?'); params.push(f.desde); }
  if (f.hasta) { where.push('pg.fecha <= ?'); params.push(f.hasta); }
  if (f.cierre_id) { where.push('dc.cierre_id = ?'); params.push(f.cierre_id); }
  if (f.apartamento_id) { where.push('dc.apartamento_id = ?'); params.push(f.apartamento_id); }
  if (f.unidad_id) { where.push('a.unidad_id = ?'); params.push(f.unidad_id); }
  if (f.incluir_anulados !== '1') where.push('pg.anulado = 0');
  res.json(await query(`
    SELECT pg.*, dc.cierre_id, cs.codigo AS cierre_codigo, dc.unidad_nombre AS unidad, dc.apartamento_numero AS apartamento,
           dc.apartamento_id, dc.total AS total_cuenta
    FROM pagos pg
    JOIN detalle_cierres dc ON dc.id = pg.detalle_cierre_id
    JOIN cierres_semanales cs ON cs.id = dc.cierre_id
    JOIN apartamentos a ON a.id = dc.apartamento_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY pg.fecha DESC, pg.id DESC`, params));
});

router.post('/', validate(z.object({
  detalle_cierre_id: z.coerce.number().int().positive('Cuenta de cobro inválida'),
  fecha: fechaISO,
  monto: z.coerce.number({ error: 'Monto inválido' }).positive('El monto debe ser mayor que cero'),
  metodo: z.enum(METODOS).default('EFECTIVO'),
  referencia: optStr(80), observaciones: optStr(500),
})), async (req, res) => {
  const b = req.valid.body;
  const id = await withTransaction(async (conn) => {
    const [[dc]] = await conn.query(
      `SELECT dc.id, dc.total, cs.estado, cs.codigo FROM detalle_cierres dc
       JOIN cierres_semanales cs ON cs.id = dc.cierre_id WHERE dc.id = ? FOR UPDATE`, [b.detalle_cierre_id]);
    if (!dc) throw notFound('Cuenta de cobro');
    if (dc.estado !== 'CERRADO') throw new HttpError(409, `El cierre ${dc.codigo} fue reabierto; registre los pagos sobre el nuevo cierre.`, 'CIERRE_REABIERTO');
    const [[s]] = await conn.query('SELECT COALESCE(SUM(monto),0) AS pagado FROM pagos WHERE detalle_cierre_id = ? AND anulado = 0', [dc.id]);
    const saldo = round2(dc.total - s.pagado);
    if (saldo <= 0) throw new HttpError(409, 'Esta cuenta ya está totalmente pagada.', 'YA_PAGADA');
    if (round2(b.monto) > saldo) throw new HttpError(400, `El pago (${fmtMoney(b.monto)}) supera el saldo pendiente (${fmtMoney(saldo)}).`, 'SOBREPAGO');
    const [r] = await conn.query(
      'INSERT INTO pagos (detalle_cierre_id, fecha, monto, metodo, referencia, observaciones) VALUES (?,?,?,?,?,?)',
      [dc.id, b.fecha, round2(b.monto), b.metodo, b.referencia ?? null, b.observaciones ?? null]);
    await audit(conn, 'pago', r.insertId, 'REGISTRAR', b);
    return r.insertId;
  });
  const [row] = await query('SELECT * FROM pagos WHERE id = ?', [id]);
  res.status(201).json(row);
});

router.post('/:id/anular', validate(idParam, 'params'), validate(z.object({
  motivo: z.string({ error: 'Indique el motivo' }).trim().min(5, 'Describa el motivo (mínimo 5 caracteres)').max(500),
})), async (req, res) => {
  const { id } = req.valid.params; const { motivo } = req.valid.body;
  await withTransaction(async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM pagos WHERE id = ? FOR UPDATE', [id]);
    if (!p) throw notFound('Pago');
    if (p.anulado) throw new HttpError(409, 'El pago ya estaba anulado.', 'YA_ANULADO');
    await conn.query('UPDATE pagos SET anulado = 1, motivo_anulacion = ? WHERE id = ?', [motivo, id]);
    await audit(conn, 'pago', id, 'ANULAR', { monto: p.monto, fecha: p.fecha }, motivo);
  });
  const [row] = await query('SELECT * FROM pagos WHERE id = ?', [id]);
  res.json(row);
});

module.exports = router;
