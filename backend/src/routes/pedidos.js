// Ruta: backend/src/routes/pedidos.js
// Registro, edición, consulta y cambio de estado de pedidos.
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { validate, z, idParam, optId, optStr, fechaISO, optFecha } = require('../middleware/validate');
const { audit, notFound, HttpError, round2 } = require('../utils/helpers');

const ESTADOS = ['PENDIENTE', 'CONFIRMADO', 'ENTREGADO', 'CANCELADO'];

const SELECT_PEDIDO = `
  SELECT p.id, p.numero, p.fecha, p.estado, p.observaciones, p.motivo_cancelacion,
         p.apartamento_id, a.numero AS apartamento, u.id AS unidad_id, u.nombre AS unidad,
         p.cliente_id, c.nombre AS cliente, c.telefono,
         p.cierre_id, cs.codigo AS cierre_codigo, cs.estado AS cierre_estado,
         t.total, t.items, p.created_at, p.updated_at
  FROM pedidos p
  JOIN apartamentos a ON a.id = p.apartamento_id
  JOIN unidades_residenciales u ON u.id = a.unidad_id
  LEFT JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN cierres_semanales cs ON cs.id = p.cierre_id
  JOIN v_pedidos_totales t ON t.pedido_id = p.id`;

async function getPedido(id, conn) {
  const q = conn ? (s, p) => conn.query(s, p).then((r) => r[0]) : query;
  const [pedido] = await q(`${SELECT_PEDIDO} WHERE p.id = ?`, [id]);
  if (!pedido) return null;
  pedido.detalle = await q(`
    SELECT d.id, d.producto_id, pr.nombre AS producto, d.unidad_medida_id, um.nombre AS unidad_medida,
           um.abreviatura, um.permite_decimales, d.cantidad, d.precio_unitario, d.subtotal,
           pr.precio AS precio_actual, pr.activo AS producto_activo
    FROM detalle_pedidos d
    JOIN productos pr ON pr.id = d.producto_id
    JOIN unidades_medida um ON um.id = d.unidad_medida_id
    WHERE d.pedido_id = ? ORDER BY d.id`, [id]);
  pedido.bloqueado = pedido.cierre_estado === 'CERRADO';
  return pedido;
}

/* ------------------------------- Listado ------------------------------- */
const listSchema = z.object({
  desde: optFecha, hasta: optFecha,
  estado: z.enum([...ESTADOS, 'VALIDOS', 'TODOS']).optional(),
  unidad_id: optId, apartamento_id: optId, cliente_id: optId, producto_id: optId, cierre_id: optId,
  sin_cierre: z.enum(['1']).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const f = req.valid.query;
  const where = []; const params = [];
  if (f.desde) { where.push('p.fecha >= ?'); params.push(f.desde); }
  if (f.hasta) { where.push('p.fecha <= ?'); params.push(f.hasta); }
  if (f.estado === 'VALIDOS') where.push("p.estado <> 'CANCELADO'");
  else if (f.estado && f.estado !== 'TODOS') { where.push('p.estado = ?'); params.push(f.estado); }
  if (f.unidad_id) { where.push('u.id = ?'); params.push(f.unidad_id); }
  if (f.apartamento_id) { where.push('p.apartamento_id = ?'); params.push(f.apartamento_id); }
  if (f.cliente_id) { where.push('p.cliente_id = ?'); params.push(f.cliente_id); }
  if (f.cierre_id) { where.push('p.cierre_id = ?'); params.push(f.cierre_id); }
  if (f.sin_cierre) where.push('p.cierre_id IS NULL');
  if (f.producto_id) { where.push('EXISTS (SELECT 1 FROM detalle_pedidos dx WHERE dx.pedido_id = p.id AND dx.producto_id = ?)'); params.push(f.producto_id); }
  if (f.q) { where.push('(p.numero LIKE ? OR u.nombre LIKE ? OR a.numero LIKE ? OR c.nombre LIKE ?)'); params.push(...Array(4).fill(`%${f.q}%`)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [count] = await query(`SELECT COUNT(*) AS n, COALESCE(SUM(t.total),0) AS suma FROM pedidos p
    JOIN apartamentos a ON a.id = p.apartamento_id JOIN unidades_residenciales u ON u.id = a.unidad_id
    LEFT JOIN clientes c ON c.id = p.cliente_id JOIN v_pedidos_totales t ON t.pedido_id = p.id ${w}`, params);
  const rows = await query(`${SELECT_PEDIDO} ${w} ORDER BY p.fecha DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]);
  res.json({ data: rows, total: count.n, suma: count.suma, page: f.page, limit: f.limit });
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const p = await getPedido(req.valid.params.id);
  if (!p) throw notFound('Pedido');
  res.json(p);
});

/* --------------------------- Crear / editar --------------------------- */
const itemSchema = z.object({
  producto_id: z.coerce.number().int().positive('Producto inválido'),
  cantidad: z.coerce.number({ error: 'Cantidad inválida' }).positive('La cantidad debe ser mayor que cero').max(99999, 'Cantidad demasiado alta'),
});
const pedidoSchema = z.object({
  clave_idempotencia: z.string().uuid('Clave de envío inválida').optional(),
  fecha: fechaISO,
  apartamento_id: z.coerce.number({ error: 'Seleccione el apartamento' }).int().positive('Seleccione el apartamento'),
  cliente_id: optId.nullable(),
  estado: z.enum(ESTADOS).exclude(['CANCELADO']).optional(),
  observaciones: optStr(500),
  items: z.array(itemSchema).min(1, 'Agregue al menos un producto al pedido').max(100),
  confirmar_duplicado: z.boolean().optional(),
});

/** Verifica que la fecha no pertenezca a un período ya cerrado. */
async function assertFechaAbierta(conn, fecha) {
  const [[c]] = await conn.query(
    "SELECT codigo, fecha_inicio, fecha_fin FROM cierres_semanales WHERE estado='CERRADO' AND ? BETWEEN fecha_inicio AND fecha_fin LIMIT 1", [fecha]);
  if (c) {
    throw new HttpError(409, `La fecha ${fecha} pertenece al cierre ${c.codigo} (${c.fecha_inicio} a ${c.fecha_fin}), que ya está cerrado. Reabra el cierre para registrar o modificar pedidos de ese período.`, 'PERIODO_CERRADO');
  }
}

/** Valida apartamento/cliente y consolida los ítems (suma cantidades repetidas). */
async function prepararPedido(conn, b) {
  const [[apto]] = await conn.query('SELECT id FROM apartamentos WHERE id = ?', [b.apartamento_id]);
  if (!apto) throw new HttpError(400, 'El apartamento seleccionado no existe.', 'REFERENCIA_INVALIDA');
  if (b.cliente_id) {
    const [[cli]] = await conn.query('SELECT apartamento_id FROM clientes WHERE id = ?', [b.cliente_id]);
    if (!cli) throw new HttpError(400, 'El cliente seleccionado no existe.', 'REFERENCIA_INVALIDA');
    if (cli.apartamento_id !== b.apartamento_id) throw new HttpError(400, 'El cliente no pertenece al apartamento seleccionado.', 'CLIENTE_APTO');
  }
  const merged = new Map();
  for (const it of b.items) merged.set(it.producto_id, round2((merged.get(it.producto_id) || 0) + it.cantidad));
  const ids = [...merged.keys()];
  const [prods] = await conn.query(
    `SELECT p.id, p.nombre, p.precio, p.activo, p.unidad_medida_id, um.permite_decimales
     FROM productos p JOIN unidades_medida um ON um.id = p.unidad_medida_id WHERE p.id IN (?)`, [ids]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  for (const [pid, cant] of merged) {
    const p = byId.get(pid);
    if (!p) throw new HttpError(400, `El producto #${pid} no existe.`, 'REFERENCIA_INVALIDA');
    if (!p.permite_decimales && !Number.isInteger(cant)) {
      throw new HttpError(400, `"${p.nombre}" se vende por unidades enteras; la cantidad ${cant} no es válida.`, 'CANTIDAD_INVALIDA');
    }
  }
  return { merged, byId };
}

router.post('/', validate(pedidoSchema), async (req, res) => {
  const b = req.valid.body;
  const result = await withTransaction(async (conn) => {
    // 1. Idempotencia: si el mismo formulario se envía dos veces, se devuelve el pedido existente.
    if (b.clave_idempotencia) {
      const [[ex]] = await conn.query('SELECT id FROM pedidos WHERE clave_idempotencia = ?', [b.clave_idempotencia]);
      if (ex) return { id: ex.id, repetido: true };
    }
    await assertFechaAbierta(conn, b.fecha);
    const { merged, byId } = await prepararPedido(conn, b);
    for (const pid of merged.keys()) {
      if (!byId.get(pid).activo) throw new HttpError(400, `El producto "${byId.get(pid).nombre}" está inactivo.`, 'PRODUCTO_INACTIVO');
    }
    // 2. Posible duplicado: mismo apartamento, misma fecha y mismos productos/cantidades.
    if (!b.confirmar_duplicado) {
      const firma = [...merged.entries()].sort((x, y) => x[0] - y[0]).map(([p, c]) => `${p}:${Number(c)}`).join('|');
      const [cands] = await conn.query(
        `SELECT p.id, p.numero, GROUP_CONCAT(CONCAT(d.producto_id, ':', TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM d.cantidad))) ORDER BY d.producto_id SEPARATOR '|') AS firma
         FROM pedidos p JOIN detalle_pedidos d ON d.pedido_id = p.id
         WHERE p.apartamento_id = ? AND p.fecha = ? AND p.estado <> 'CANCELADO' GROUP BY p.id`, [b.apartamento_id, b.fecha]);
      const dup = cands.find((c) => c.firma === firma);
      if (dup) throw new HttpError(409, `Ya existe un pedido idéntico (${dup.numero}) para este apartamento en la misma fecha. ¿Desea registrarlo de todas formas?`, 'POSIBLE_DUPLICADO', { pedido_id: dup.id });
    }
    // 3. Inserción con precios históricos congelados.
    const [r] = await conn.query(
      'INSERT INTO pedidos (clave_idempotencia, fecha, apartamento_id, cliente_id, estado, observaciones) VALUES (?,?,?,?,?,?)',
      [b.clave_idempotencia ?? null, b.fecha, b.apartamento_id, b.cliente_id ?? null, b.estado ?? 'PENDIENTE', b.observaciones ?? null]);
    const numero = `P-${String(r.insertId).padStart(6, '0')}`;
    await conn.query('UPDATE pedidos SET numero = ? WHERE id = ?', [numero, r.insertId]);
    const rows = [...merged.entries()].map(([pid, cant]) => {
      const p = byId.get(pid);
      return [r.insertId, pid, p.unidad_medida_id, cant, p.precio];
    });
    await conn.query('INSERT INTO detalle_pedidos (pedido_id, producto_id, unidad_medida_id, cantidad, precio_unitario) VALUES ?', [rows]);
    await audit(conn, 'pedido', r.insertId, 'CREAR', { numero, ...b });
    return { id: r.insertId, repetido: false };
  });
  const pedido = await getPedido(result.id);
  res.status(result.repetido ? 200 : 201).json({ ...pedido, repetido: result.repetido });
});

/** Carga el pedido con bloqueo y verifica que se pueda modificar. */
async function lockEditable(conn, id) {
  const [[p]] = await conn.query(
    `SELECT p.*, cs.estado AS cierre_estado, cs.codigo AS cierre_codigo FROM pedidos p
     LEFT JOIN cierres_semanales cs ON cs.id = p.cierre_id WHERE p.id = ? FOR UPDATE`, [id]);
  if (!p) throw notFound('Pedido');
  if (p.cierre_id && p.cierre_estado === 'CERRADO') {
    throw new HttpError(409, `El pedido ${p.numero} pertenece al cierre ${p.cierre_codigo}, que está cerrado. Para corregirlo debe reabrir el cierre (queda registro en auditoría).`, 'PEDIDO_CERRADO');
  }
  return p;
}

router.put('/:id', validate(idParam, 'params'), validate(pedidoSchema.extend({
  actualizar_precios: z.boolean().optional(),
})), async (req, res) => {
  const { id } = req.valid.params; const b = req.valid.body;
  await withTransaction(async (conn) => {
    const prev = await lockEditable(conn, id);
    if (prev.estado === 'CANCELADO') throw new HttpError(409, 'Un pedido cancelado no se puede editar. Reactívelo primero.', 'PEDIDO_CANCELADO');
    await assertFechaAbierta(conn, b.fecha);
    const { merged, byId } = await prepararPedido(conn, b);
    const [prevDet] = await conn.query('SELECT producto_id, cantidad, precio_unitario, unidad_medida_id FROM detalle_pedidos WHERE pedido_id = ?', [id]);
    const prevMap = new Map(prevDet.map((d) => [d.producto_id, d]));
    // Productos nuevos en el pedido deben estar activos.
    for (const pid of merged.keys()) {
      if (!prevMap.has(pid) && !byId.get(pid).activo) throw new HttpError(400, `El producto "${byId.get(pid).nombre}" está inactivo.`, 'PRODUCTO_INACTIVO');
    }
    await conn.query('UPDATE pedidos SET fecha=?, apartamento_id=?, cliente_id=?, estado=COALESCE(?, estado), observaciones=? WHERE id=?',
      [b.fecha, b.apartamento_id, b.cliente_id ?? null, b.estado ?? null, b.observaciones ?? null, id]);
    await conn.query('DELETE FROM detalle_pedidos WHERE pedido_id = ?', [id]);
    // Las líneas existentes conservan su precio histórico, salvo que se pida explícitamente actualizarlo.
    const rows = [...merged.entries()].map(([pid, cant]) => {
      const old = prevMap.get(pid); const p = byId.get(pid);
      const keep = old && !b.actualizar_precios;
      return [id, pid, keep ? old.unidad_medida_id : p.unidad_medida_id, cant, keep ? old.precio_unitario : p.precio];
    });
    await conn.query('INSERT INTO detalle_pedidos (pedido_id, producto_id, unidad_medida_id, cantidad, precio_unitario) VALUES ?', [rows]);
    await audit(conn, 'pedido', id, 'EDITAR', {
      antes: { fecha: prev.fecha, apartamento_id: prev.apartamento_id, cliente_id: prev.cliente_id, estado: prev.estado, observaciones: prev.observaciones, items: prevDet },
      despues: b,
    });
  });
  res.json(await getPedido(id));
});

router.patch('/:id/estado', validate(idParam, 'params'), validate(z.object({
  estado: z.enum(ESTADOS, { error: 'Estado inválido' }),
  motivo: optStr(500),
})), async (req, res) => {
  const { id } = req.valid.params; const { estado, motivo } = req.valid.body;
  if (estado === 'CANCELADO' && !motivo) throw new HttpError(400, 'Indique el motivo de la cancelación.', 'VALIDACION');
  await withTransaction(async (conn) => {
    const prev = await lockEditable(conn, id);
    if (prev.estado === estado) return;
    if (prev.estado === 'CANCELADO') await assertFechaAbierta(conn, prev.fecha);
    await conn.query('UPDATE pedidos SET estado = ?, motivo_cancelacion = ? WHERE id = ?',
      [estado, estado === 'CANCELADO' ? motivo : null, id]);
    await audit(conn, 'pedido', id, estado === 'CANCELADO' ? 'CANCELAR' : 'CAMBIO_ESTADO', { de: prev.estado, a: estado }, motivo ?? null);
  });
  res.json(await getPedido(id));
});

module.exports = router;
module.exports.getPedido = getPedido;
