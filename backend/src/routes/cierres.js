// Ruta: backend/src/routes/cierres.js
// Cierre y liquidación semanal: vista previa, cierre, consulta, reapertura y exportación.
const router = require('express').Router();
const { pool, query, withTransaction } = require('../config/db');
const { validate, z, idParam, optStr, fechaISO } = require('../middleware/validate');
const { audit, notFound, HttpError, round2 } = require('../utils/helpers');
const { calcularLiquidacion } = require('../services/liquidacion');
const { cierrePDF } = require('../services/pdf');
const { cierreExcel } = require('../services/excel');
const { getConfig } = require('./configuracion');

const rangoSchema = z.object({ desde: fechaISO, hasta: fechaISO })
  .refine((r) => r.hasta >= r.desde, { message: 'La fecha final debe ser igual o posterior a la inicial', path: ['hasta'] });

const estadoPago = (total, pagado) => (pagado <= 0 ? 'PENDIENTE' : pagado + 0.005 >= total ? 'PAGADO' : 'PARCIAL');

/** Arma el cierre completo a partir de la fotografía histórica guardada. */
async function getCierre(id, db) {
  const q = db ? (s, p) => db.query(s, p).then((r) => r[0]) : query;
  const [cierre] = await q('SELECT * FROM cierres_semanales WHERE id = ?', [id]);
  if (!cierre) return null;
  const detalles = await q(`
    SELECT dc.*, s.pagado, s.saldo, u.id AS unidad_id
    FROM detalle_cierres dc
    JOIN v_saldos_cierre s ON s.detalle_cierre_id = dc.id
    JOIN apartamentos a ON a.id = dc.apartamento_id
    JOIN unidades_residenciales u ON u.id = a.unidad_id
    WHERE dc.cierre_id = ?
    ORDER BY dc.unidad_nombre, dc.apartamento_numero IS NULL, LPAD(dc.apartamento_numero, 10, '0')`, [id]);
  const productos = await q(`
    SELECT dcp.* FROM detalle_cierre_productos dcp
    JOIN detalle_cierres dc ON dc.id = dcp.detalle_cierre_id
    WHERE dc.cierre_id = ? ORDER BY dcp.producto_nombre`, [id]);
  const byDet = new Map();
  for (const p of productos) {
    if (!byDet.has(p.detalle_cierre_id)) byDet.set(p.detalle_cierre_id, []);
    byDet.get(p.detalle_cierre_id).push(p);
  }
  const unidades = new Map();
  let recaudado = 0; let porCobrar = 0;
  for (const d of detalles) {
    recaudado = round2(recaudado + d.pagado); porCobrar = round2(porCobrar + d.saldo);
    if (!unidades.has(d.unidad_nombre)) unidades.set(d.unidad_nombre, { unidad: d.unidad_nombre, unidad_id: d.unidad_id, total: 0, apartamentos: [] });
    const u = unidades.get(d.unidad_nombre);
    u.total = round2(u.total + d.total);
    u.apartamentos.push({
      detalle_cierre_id: d.id, apartamento_id: d.apartamento_id, apartamento: d.apartamento_numero,
      unidad: d.unidad_nombre, clientes: d.clientes_nombres, cantidad_pedidos: d.cantidad_pedidos,
      total: d.total, pagado: d.pagado, saldo: d.saldo, estado_pago: estadoPago(d.total, d.pagado),
      productos: byDet.get(d.id) || [],
    });
  }
  return { ...cierre, recaudado, por_cobrar: porCobrar, unidades: [...unidades.values()] };
}

/* ---------------------------- Vista previa ---------------------------- */
router.get('/preview', validate(rangoSchema, 'query'), async (req, res) => {
  const { desde, hasta } = req.valid.query;
  const liq = await calcularLiquidacion(pool, desde, hasta);
  const solapados = await query(
    "SELECT id, codigo, fecha_inicio, fecha_fin FROM cierres_semanales WHERE estado='CERRADO' AND fecha_inicio <= ? AND fecha_fin >= ?", [hasta, desde]);
  const [ya] = await query(
    `SELECT COUNT(*) AS n FROM pedidos p JOIN cierres_semanales cs ON cs.id = p.cierre_id
     WHERE p.fecha BETWEEN ? AND ? AND cs.estado = 'CERRADO'`, [desde, hasta]);
  res.json({ ...liq, cierres_solapados: solapados, pedidos_ya_cerrados: ya.n });
});

/* ------------------------------- Listado ------------------------------- */
router.get('/', async (_req, res) => {
  res.json(await query(`
    SELECT cs.*, COUNT(dc.id) AS apartamentos,
           COALESCE(SUM(s.pagado),0) AS recaudado, COALESCE(SUM(s.saldo),0) AS por_cobrar
    FROM cierres_semanales cs
    LEFT JOIN detalle_cierres dc ON dc.cierre_id = cs.id
    LEFT JOIN v_saldos_cierre s ON s.detalle_cierre_id = dc.id
    GROUP BY cs.id ORDER BY cs.fecha_inicio DESC, cs.id DESC`));
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const c = await getCierre(req.valid.params.id);
  if (!c) throw notFound('Cierre');
  res.json(c);
});

/* ------------------------------ Crear cierre ------------------------------ */
router.post('/', validate(z.object({
  fecha_inicio: fechaISO, fecha_fin: fechaISO, observaciones: optStr(500),
}).refine((r) => r.fecha_fin >= r.fecha_inicio, { message: 'La fecha final debe ser igual o posterior a la inicial', path: ['fecha_fin'] })),
async (req, res) => {
  const { fecha_inicio: desde, fecha_fin: hasta, observaciones } = req.valid.body;
  const id = await withTransaction(async (conn) => {
    // Serializa cierres concurrentes y evita períodos superpuestos.
    await conn.query('SELECT id FROM cierres_semanales FOR UPDATE');
    const [solap] = await conn.query(
      "SELECT codigo, fecha_inicio, fecha_fin FROM cierres_semanales WHERE estado='CERRADO' AND fecha_inicio <= ? AND fecha_fin >= ?", [hasta, desde]);
    if (solap.length) {
      const c = solap[0];
      throw new HttpError(409, `El período se superpone con el cierre ${c.codigo} (${c.fecha_inicio} a ${c.fecha_fin}). Ajuste las fechas o reabra ese cierre.`, 'CIERRE_SOLAPADO');
    }
    const liq = await calcularLiquidacion(conn, desde, hasta, true);
    if (!liq.total_pedidos) throw new HttpError(400, 'No hay pedidos válidos sin liquidar en el período seleccionado.', 'SIN_PEDIDOS');

    const [r] = await conn.query(
      'INSERT INTO cierres_semanales (codigo, fecha_inicio, fecha_fin, total_general, total_pedidos, observaciones) VALUES (?,?,?,?,?,?)',
      [`TMP-${Date.now()}`, desde, hasta, liq.total_general, liq.total_pedidos, observaciones ?? null]);
    const codigo = `C-${desde.slice(0, 4)}-${String(r.insertId).padStart(4, '0')}`;
    await conn.query('UPDATE cierres_semanales SET codigo = ? WHERE id = ?', [codigo, r.insertId]);

    for (const u of liq.unidades) {
      for (const a of u.apartamentos) {
        const [dc] = await conn.query(
          `INSERT INTO detalle_cierres (cierre_id, apartamento_id, unidad_nombre, apartamento_numero, clientes_nombres, cantidad_pedidos, total)
           VALUES (?,?,?,?,?,?,?)`,
          [r.insertId, a.apartamento_id, a.unidad, a.apartamento, a.clientes ? a.clientes.slice(0, 300) : null, a.cantidad_pedidos, a.total]);
        await conn.query(
          `INSERT INTO detalle_cierre_productos (detalle_cierre_id, producto_id, producto_nombre, unidad_medida, cantidad, precio_unitario, total) VALUES ?`,
          [a.productos.map((p) => [dc.insertId, p.producto_id, p.producto, p.abreviatura, p.cantidad, p.precio_unitario, p.total])]);
      }
    }
    await conn.query('UPDATE pedidos SET cierre_id = ? WHERE id IN (?)', [r.insertId, liq.pedido_ids]);
    await audit(conn, 'cierre', r.insertId, 'CERRAR', { codigo, desde, hasta, total_general: liq.total_general, pedidos: liq.total_pedidos });
    return r.insertId;
  });
  res.status(201).json(await getCierre(id));
});

/* ------------------------------- Reapertura ------------------------------- */
router.post('/:id/reabrir', validate(idParam, 'params'), validate(z.object({
  motivo: z.string({ error: 'Indique el motivo de la reapertura' }).trim().min(5, 'Describa el motivo (mínimo 5 caracteres)').max(500),
})), async (req, res) => {
  const { id } = req.valid.params; const { motivo } = req.valid.body;
  await withTransaction(async (conn) => {
    const [[c]] = await conn.query('SELECT * FROM cierres_semanales WHERE id = ? FOR UPDATE', [id]);
    if (!c) throw notFound('Cierre');
    if (c.estado !== 'CERRADO') throw new HttpError(409, 'El cierre ya fue reabierto.', 'YA_REABIERTO');
    const [[pg]] = await conn.query(
      `SELECT COUNT(*) AS n FROM pagos p JOIN detalle_cierres dc ON dc.id = p.detalle_cierre_id
       WHERE dc.cierre_id = ? AND p.anulado = 0`, [id]);
    if (pg.n > 0) {
      throw new HttpError(409, `El cierre tiene ${pg.n} pago(s) registrados. Anule primero los pagos (quedan en auditoría) y luego reabra el cierre.`, 'TIENE_PAGOS');
    }
    await conn.query("UPDATE cierres_semanales SET estado='REABIERTO', reabierto_at=NOW(), motivo_reapertura=? WHERE id=?", [motivo, id]);
    const [r] = await conn.query('UPDATE pedidos SET cierre_id = NULL WHERE cierre_id = ?', [id]);
    await audit(conn, 'cierre', id, 'REABRIR', { codigo: c.codigo, total_liquidado: c.total_general, pedidos_liberados: r.affectedRows }, motivo);
  });
  res.json(await getCierre(id));
});

/* -------------------- Cuenta de cobro individual + pedidos -------------------- */
router.get('/:id/cuentas/:detalleId', validate(z.object({
  id: z.coerce.number().int().positive(), detalleId: z.coerce.number().int().positive(),
}), 'params'), async (req, res) => {
  const { id, detalleId } = req.valid.params;
  const c = await getCierre(id);
  if (!c) throw notFound('Cierre');
  const cuenta = c.unidades.flatMap((u) => u.apartamentos).find((a) => a.detalle_cierre_id === detalleId);
  if (!cuenta) throw notFound('Cuenta de cobro');
  const pedidos = await query(`
    SELECT p.id, p.numero, p.fecha, p.estado, c.nombre AS cliente, t.total, t.items
    FROM pedidos p JOIN v_pedidos_totales t ON t.pedido_id = p.id LEFT JOIN clientes c ON c.id = p.cliente_id
    WHERE p.cierre_id = ? AND p.apartamento_id = ? ORDER BY p.fecha, p.id`, [id, cuenta.apartamento_id]);
  const pagos = await query('SELECT * FROM pagos WHERE detalle_cierre_id = ? ORDER BY fecha, id', [detalleId]);
  res.json({ cierre: { id: c.id, codigo: c.codigo, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, estado: c.estado }, cuenta, pedidos, pagos });
});

/* ------------------------------ Exportaciones ------------------------------ */
router.get('/:id/pdf', validate(idParam, 'params'), validate(z.object({ detalle: z.coerce.number().int().positive().optional() }), 'query'), async (req, res) => {
  const c = await getCierre(req.valid.params.id);
  if (!c) throw notFound('Cierre');
  cierrePDF(res, c, await getConfig(), req.valid.query.detalle);
});
router.get('/:id/excel', validate(idParam, 'params'), async (req, res) => {
  const c = await getCierre(req.valid.params.id);
  if (!c) throw notFound('Cierre');
  const pedidos = await query(`
    SELECT p.numero, p.fecha, p.estado, u.nombre AS unidad, a.numero AS apartamento, c.nombre AS cliente,
           pr.nombre AS producto, um.nombre AS unidad_medida, d.cantidad, d.precio_unitario, d.subtotal
    FROM pedidos p JOIN detalle_pedidos d ON d.pedido_id = p.id
    JOIN apartamentos a ON a.id = p.apartamento_id JOIN unidades_residenciales u ON u.id = a.unidad_id
    LEFT JOIN clientes c ON c.id = p.cliente_id JOIN productos pr ON pr.id = d.producto_id
    JOIN unidades_medida um ON um.id = d.unidad_medida_id
    WHERE p.cierre_id = ? ORDER BY p.fecha, p.id`, [c.id]);
  await cierreExcel(res, c, pedidos, await getConfig());
});

module.exports = router;
module.exports.getCierre = getCierre;
