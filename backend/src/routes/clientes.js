// Ruta: backend/src/routes/clientes.js
// Unidades residenciales, apartamentos y clientes (compradores).
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { validate, z, idParam, optId, optStr, reqStr } = require('../middleware/validate');
const { audit, notFound, HttpError } = require('../utils/helpers');

const numApto = z.preprocess(
  (v) => (v === undefined || v === null ? null : String(v).trim() === '' ? null : String(v).trim().toUpperCase()),
  z.string().max(20, 'Número de apartamento: máximo 20 caracteres').nullable());

/* ------------------------ Unidades residenciales ------------------------ */
router.get('/unidades', async (_req, res) => {
  res.json(await query(`
    SELECT u.*,
      (SELECT COUNT(*) FROM apartamentos a WHERE a.unidad_id = u.id) AS apartamentos,
      (SELECT COUNT(*) FROM clientes c JOIN apartamentos a ON a.id = c.apartamento_id WHERE a.unidad_id = u.id) AS clientes
    FROM unidades_residenciales u ORDER BY u.activo DESC, u.nombre`));
});

const unidadSchema = z.object({
  nombre: reqStr(120, 'Nombre de la unidad'), direccion: optStr(200), observaciones: optStr(500),
  activo: z.boolean().optional(),
});
router.post('/unidades', validate(unidadSchema), async (req, res) => {
  const b = req.valid.body;
  const id = await withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT id FROM unidades_residenciales WHERE nombre = ?', [b.nombre]);
    if (dup.length) throw new HttpError(409, `La unidad "${b.nombre}" ya está registrada.`, 'DUPLICADO');
    const [r] = await conn.query('INSERT INTO unidades_residenciales (nombre, direccion, observaciones) VALUES (?,?,?)',
      [b.nombre, b.direccion ?? null, b.observaciones ?? null]);
    // Toda unidad tiene un apartamento "Sin especificar" para pedidos sin número.
    await conn.query('INSERT INTO apartamentos (unidad_id, numero) VALUES (?, NULL)', [r.insertId]);
    await audit(conn, 'unidad', r.insertId, 'CREAR', b);
    return r.insertId;
  });
  res.status(201).json({ id, ...b });
});
router.put('/unidades/:id', validate(idParam, 'params'), validate(unidadSchema), async (req, res) => {
  const { id } = req.valid.params; const b = req.valid.body;
  await withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT id FROM unidades_residenciales WHERE nombre = ? AND id <> ?', [b.nombre, id]);
    if (dup.length) throw new HttpError(409, `Ya existe otra unidad llamada "${b.nombre}".`, 'DUPLICADO');
    const [r] = await conn.query('UPDATE unidades_residenciales SET nombre=?, direccion=?, observaciones=?, activo=COALESCE(?, activo) WHERE id=?',
      [b.nombre, b.direccion ?? null, b.observaciones ?? null, b.activo === undefined ? null : (b.activo ? 1 : 0), id]);
    if (!r.affectedRows) throw notFound('Unidad residencial');
    await audit(conn, 'unidad', id, 'EDITAR', b);
  });
  res.json({ id, ...b });
});

/* ----------------------------- Apartamentos ----------------------------- */
const SELECT_APTO = `
  SELECT a.id, a.unidad_id, u.nombre AS unidad, a.numero, a.observaciones, a.activo, a.created_at,
    (SELECT COUNT(*) FROM pedidos p WHERE p.apartamento_id = a.id AND p.estado <> 'CANCELADO') AS pedidos,
    (SELECT COALESCE(SUM(d.subtotal),0) FROM pedidos p JOIN detalle_pedidos d ON d.pedido_id = p.id
       WHERE p.apartamento_id = a.id AND p.estado <> 'CANCELADO') AS total_comprado,
    (SELECT COALESCE(SUM(s.saldo),0) FROM v_saldos_cierre s JOIN cierres_semanales cs ON cs.id = s.cierre_id
       WHERE s.apartamento_id = a.id AND cs.estado = 'CERRADO') AS saldo_pendiente
  FROM apartamentos a JOIN unidades_residenciales u ON u.id = a.unidad_id`;

router.get('/apartamentos', validate(z.object({
  unidad_id: optId, numero: z.string().trim().optional(), q: z.string().trim().optional(),
}), 'query'), async (req, res) => {
  const { unidad_id, numero, q } = req.valid.query;
  const where = []; const params = [];
  if (unidad_id) { where.push('a.unidad_id = ?'); params.push(unidad_id); }
  if (numero) { where.push('a.numero LIKE ?'); params.push(`%${numero}%`); }
  if (q) { where.push('(u.nombre LIKE ? OR a.numero LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = await query(`${SELECT_APTO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.nombre, a.numero IS NULL, LPAD(a.numero, 10, '0')`, params);
  res.json(rows);
});

const aptoSchema = z.object({
  unidad_id: z.coerce.number({ error: 'Seleccione la unidad' }).int().positive('Seleccione la unidad'),
  numero: numApto, observaciones: optStr(500), activo: z.boolean().optional(),
});
router.post('/apartamentos', validate(aptoSchema), async (req, res) => {
  const b = req.valid.body;
  const id = await withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT id FROM apartamentos WHERE unidad_id = ? AND numero_clave = ?', [b.unidad_id, b.numero ?? '']);
    if (dup.length) throw new HttpError(409, b.numero ? `El apartamento ${b.numero} ya existe en esta unidad.` : 'Esta unidad ya tiene el registro "Sin especificar".', 'DUPLICADO');
    const [r] = await conn.query('INSERT INTO apartamentos (unidad_id, numero, observaciones) VALUES (?,?,?)',
      [b.unidad_id, b.numero, b.observaciones ?? null]);
    await audit(conn, 'apartamento', r.insertId, 'CREAR', b);
    return r.insertId;
  });
  const [row] = await query(`${SELECT_APTO} WHERE a.id = ?`, [id]);
  res.status(201).json(row);
});
router.put('/apartamentos/:id', validate(idParam, 'params'), validate(aptoSchema), async (req, res) => {
  const { id } = req.valid.params; const b = req.valid.body;
  await withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT id FROM apartamentos WHERE unidad_id = ? AND numero_clave = ? AND id <> ?', [b.unidad_id, b.numero ?? '', id]);
    if (dup.length) throw new HttpError(409, 'Ya existe ese apartamento en la unidad.', 'DUPLICADO');
    const [r] = await conn.query('UPDATE apartamentos SET unidad_id=?, numero=?, observaciones=?, activo=COALESCE(?, activo) WHERE id=?',
      [b.unidad_id, b.numero, b.observaciones ?? null, b.activo === undefined ? null : (b.activo ? 1 : 0), id]);
    if (!r.affectedRows) throw notFound('Apartamento');
    await audit(conn, 'apartamento', id, 'EDITAR', b);
  });
  const [row] = await query(`${SELECT_APTO} WHERE a.id = ?`, [id]);
  res.json(row);
});

/* ------------------------------- Clientes ------------------------------- */
const SELECT_CLIENTE = `
  SELECT c.id, c.nombre, c.telefono, c.observaciones, c.activo, c.created_at,
         a.id AS apartamento_id, a.numero AS apartamento, u.id AS unidad_id, u.nombre AS unidad,
         (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id AND p.estado <> 'CANCELADO') AS pedidos
  FROM clientes c
  JOIN apartamentos a ON a.id = c.apartamento_id
  JOIN unidades_residenciales u ON u.id = a.unidad_id`;

router.get('/clientes', validate(z.object({
  unidad_id: optId, apartamento_id: optId, apartamento: z.string().trim().optional(), q: z.string().trim().optional(),
}), 'query'), async (req, res) => {
  const { unidad_id, apartamento_id, apartamento, q } = req.valid.query;
  const where = []; const params = [];
  if (unidad_id) { where.push('u.id = ?'); params.push(unidad_id); }
  if (apartamento_id) { where.push('a.id = ?'); params.push(apartamento_id); }
  if (apartamento) { where.push('a.numero LIKE ?'); params.push(`%${apartamento}%`); }
  if (q) { where.push('(c.nombre LIKE ? OR c.telefono LIKE ? OR u.nombre LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  res.json(await query(`${SELECT_CLIENTE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.nombre, a.numero IS NULL, LPAD(a.numero,10,'0'), c.nombre`, params));
});

/**
 * Crea un cliente. Recibe la unidad y el número de apartamento (opcional);
 * si el apartamento no existe se crea automáticamente.
 */
const clienteSchema = z.object({
  unidad_id: z.coerce.number({ error: 'Seleccione la unidad' }).int().positive('Seleccione la unidad'),
  apartamento: numApto.optional(),
  nombre: optStr(120), telefono: optStr(30).refine((t) => !t || /^[0-9+()\-\s]{7,30}$/.test(t), 'Teléfono inválido'),
  observaciones: optStr(500), activo: z.boolean().optional(),
});

async function resolveApartamento(conn, unidadId, numero) {
  const [[u]] = await conn.query('SELECT id FROM unidades_residenciales WHERE id = ?', [unidadId]);
  if (!u) throw new HttpError(400, 'La unidad residencial no existe.', 'REFERENCIA_INVALIDA');
  const [[a]] = await conn.query('SELECT id FROM apartamentos WHERE unidad_id = ? AND numero_clave = ?', [unidadId, numero ?? '']);
  if (a) return a.id;
  const [r] = await conn.query('INSERT INTO apartamentos (unidad_id, numero) VALUES (?,?)', [unidadId, numero ?? null]);
  await audit(conn, 'apartamento', r.insertId, 'CREAR', { unidad_id: unidadId, numero });
  return r.insertId;
}

router.post('/clientes', validate(clienteSchema), async (req, res) => {
  const b = req.valid.body;
  const id = await withTransaction(async (conn) => {
    const aptoId = await resolveApartamento(conn, b.unidad_id, b.apartamento ?? null);
    const [dup] = await conn.query('SELECT id FROM clientes WHERE apartamento_id = ? AND nombre_clave = ?', [aptoId, b.nombre ?? '']);
    if (dup.length) throw new HttpError(409, 'Ese cliente ya está registrado en ese apartamento.', 'DUPLICADO');
    const [r] = await conn.query('INSERT INTO clientes (apartamento_id, nombre, telefono, observaciones) VALUES (?,?,?,?)',
      [aptoId, b.nombre ?? null, b.telefono ?? null, b.observaciones ?? null]);
    await audit(conn, 'cliente', r.insertId, 'CREAR', b);
    return r.insertId;
  });
  const [row] = await query(`${SELECT_CLIENTE} WHERE c.id = ?`, [id]);
  res.status(201).json(row);
});

router.put('/clientes/:id', validate(idParam, 'params'), validate(clienteSchema), async (req, res) => {
  const { id } = req.valid.params; const b = req.valid.body;
  await withTransaction(async (conn) => {
    const [[prev]] = await conn.query('SELECT * FROM clientes WHERE id = ? FOR UPDATE', [id]);
    if (!prev) throw notFound('Cliente');
    const aptoId = await resolveApartamento(conn, b.unidad_id, b.apartamento ?? null);
    const [dup] = await conn.query('SELECT id FROM clientes WHERE apartamento_id = ? AND nombre_clave = ? AND id <> ?', [aptoId, b.nombre ?? '', id]);
    if (dup.length) throw new HttpError(409, 'Ya existe ese cliente en ese apartamento.', 'DUPLICADO');
    await conn.query('UPDATE clientes SET apartamento_id=?, nombre=?, telefono=?, observaciones=?, activo=COALESCE(?, activo) WHERE id=?',
      [aptoId, b.nombre ?? null, b.telefono ?? null, b.observaciones ?? null, b.activo === undefined ? null : (b.activo ? 1 : 0), id]);
    await audit(conn, 'cliente', id, 'EDITAR', { antes: prev, despues: b });
  });
  const [row] = await query(`${SELECT_CLIENTE} WHERE c.id = ?`, [id]);
  res.json(row);
});

module.exports = router;
