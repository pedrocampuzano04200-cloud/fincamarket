// Ruta: backend/src/routes/productos.js
// Productos, categorías y unidades de medida.
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { validate, z, idParam, optId, optStr, reqStr } = require('../middleware/validate');
const { audit, notFound, HttpError } = require('../utils/helpers');

/* ----------------------------- Categorías ----------------------------- */
router.get('/categorias', async (_req, res) => {
  res.json(await query(
    `SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id) AS productos
     FROM categorias_productos c ORDER BY c.nombre`));
});

const categoriaSchema = z.object({ nombre: reqStr(60, 'Nombre'), descripcion: optStr(255) });
router.post('/categorias', validate(categoriaSchema), async (req, res) => {
  const { nombre, descripcion } = req.valid.body;
  const r = await query('INSERT INTO categorias_productos (nombre, descripcion) VALUES (?,?)', [nombre, descripcion ?? null]);
  res.status(201).json({ id: r.insertId, nombre, descripcion });
});
router.put('/categorias/:id', validate(idParam, 'params'), validate(categoriaSchema), async (req, res) => {
  const { nombre, descripcion } = req.valid.body;
  const r = await query('UPDATE categorias_productos SET nombre=?, descripcion=? WHERE id=?', [nombre, descripcion ?? null, req.valid.params.id]);
  if (!r.affectedRows) throw notFound('Categoría');
  res.json({ id: req.valid.params.id, nombre, descripcion });
});
router.delete('/categorias/:id', validate(idParam, 'params'), async (req, res) => {
  const r = await query('DELETE FROM categorias_productos WHERE id=?', [req.valid.params.id]);
  if (!r.affectedRows) throw notFound('Categoría');
  res.json({ ok: true });
});

/* -------------------------- Unidades de medida ------------------------- */
router.get('/unidades-medida', async (_req, res) => {
  res.json(await query('SELECT * FROM unidades_medida ORDER BY nombre'));
});
const umSchema = z.object({
  nombre: reqStr(40, 'Nombre'), abreviatura: reqStr(10, 'Abreviatura'),
  permite_decimales: z.coerce.boolean().default(false),
});
router.post('/unidades-medida', validate(umSchema), async (req, res) => {
  const { nombre, abreviatura, permite_decimales } = req.valid.body;
  const r = await query('INSERT INTO unidades_medida (nombre, abreviatura, permite_decimales) VALUES (?,?,?)',
    [nombre, abreviatura, permite_decimales ? 1 : 0]);
  res.status(201).json({ id: r.insertId, ...req.valid.body });
});
router.put('/unidades-medida/:id', validate(idParam, 'params'), validate(umSchema), async (req, res) => {
  const { nombre, abreviatura, permite_decimales } = req.valid.body;
  const r = await query('UPDATE unidades_medida SET nombre=?, abreviatura=?, permite_decimales=? WHERE id=?',
    [nombre, abreviatura, permite_decimales ? 1 : 0, req.valid.params.id]);
  if (!r.affectedRows) throw notFound('Unidad de medida');
  res.json({ id: req.valid.params.id, ...req.valid.body });
});

/* ------------------------------ Productos ------------------------------ */
const SELECT_PRODUCTO = `
  SELECT p.id, p.nombre, p.descripcion, p.precio, p.activo, p.created_at, p.updated_at,
         p.categoria_id, c.nombre AS categoria,
         p.unidad_medida_id, um.nombre AS unidad_medida, um.abreviatura, um.permite_decimales,
         (SELECT COUNT(*) FROM detalle_pedidos d WHERE d.producto_id = p.id) AS veces_pedido
  FROM productos p
  JOIN categorias_productos c ON c.id = p.categoria_id
  JOIN unidades_medida um ON um.id = p.unidad_medida_id`;

const listSchema = z.object({
  q: z.string().trim().optional(),
  categoria_id: optId,
  activo: z.enum(['0', '1', 'todos']).optional(),
});
router.get('/productos', validate(listSchema, 'query'), async (req, res) => {
  const { q, categoria_id, activo } = req.valid.query;
  const where = []; const params = [];
  if (q) { where.push('p.nombre LIKE ?'); params.push(`%${q}%`); }
  if (categoria_id) { where.push('p.categoria_id = ?'); params.push(categoria_id); }
  if (activo === '0' || activo === '1') { where.push('p.activo = ?'); params.push(Number(activo)); }
  const sql = `${SELECT_PRODUCTO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.activo DESC, p.nombre`;
  res.json(await query(sql, params));
});

router.get('/productos/:id', validate(idParam, 'params'), async (req, res) => {
  const [row] = await query(`${SELECT_PRODUCTO} WHERE p.id = ?`, [req.valid.params.id]);
  if (!row) throw notFound('Producto');
  const historialPrecios = await query(
    `SELECT created_at AS fecha, detalle FROM auditoria
     WHERE entidad='producto' AND entidad_id=? AND accion='CAMBIO_PRECIO' ORDER BY id DESC LIMIT 20`, [row.id]);
  res.json({ ...row, historial_precios: historialPrecios.map((h) => ({ fecha: h.fecha, ...JSON.parse(h.detalle) })) });
});

const productoSchema = z.object({
  nombre: reqStr(100, 'Nombre'),
  categoria_id: z.coerce.number({ error: 'Seleccione una categoría' }).int().positive('Seleccione una categoría'),
  unidad_medida_id: z.coerce.number({ error: 'Seleccione la unidad de medida' }).int().positive('Seleccione la unidad de medida'),
  descripcion: optStr(500),
  precio: z.coerce.number({ error: 'Precio inválido' }).min(0, 'El precio no puede ser negativo').max(9999999999, 'Precio demasiado alto'),
  activo: z.coerce.boolean().optional(),
});

router.post('/productos', validate(productoSchema), async (req, res) => {
  const b = req.valid.body;
  const id = await withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT id FROM productos WHERE nombre = ?', [b.nombre]);
    if (dup.length) throw new HttpError(409, `Ya existe un producto llamado "${b.nombre}".`, 'DUPLICADO');
    const [r] = await conn.query(
      'INSERT INTO productos (nombre, categoria_id, unidad_medida_id, descripcion, precio, activo) VALUES (?,?,?,?,?,?)',
      [b.nombre, b.categoria_id, b.unidad_medida_id, b.descripcion ?? null, b.precio, b.activo === false ? 0 : 1]);
    await audit(conn, 'producto', r.insertId, 'CREAR', b);
    return r.insertId;
  });
  const [row] = await query(`${SELECT_PRODUCTO} WHERE p.id = ?`, [id]);
  res.status(201).json(row);
});

router.put('/productos/:id', validate(idParam, 'params'), validate(productoSchema), async (req, res) => {
  const { id } = req.valid.params; const b = req.valid.body;
  await withTransaction(async (conn) => {
    const [[prev]] = await conn.query('SELECT * FROM productos WHERE id = ? FOR UPDATE', [id]);
    if (!prev) throw notFound('Producto');
    const [dup] = await conn.query('SELECT id FROM productos WHERE nombre = ? AND id <> ?', [b.nombre, id]);
    if (dup.length) throw new HttpError(409, `Ya existe otro producto llamado "${b.nombre}".`, 'DUPLICADO');
    await conn.query(
      'UPDATE productos SET nombre=?, categoria_id=?, unidad_medida_id=?, descripcion=?, precio=?, activo=? WHERE id=?',
      [b.nombre, b.categoria_id, b.unidad_medida_id, b.descripcion ?? null, b.precio,
        b.activo === undefined ? prev.activo : (b.activo ? 1 : 0), id]);
    if (Number(prev.precio) !== Number(b.precio)) {
      await audit(conn, 'producto', id, 'CAMBIO_PRECIO', { precio_anterior: prev.precio, precio_nuevo: b.precio });
    }
    await audit(conn, 'producto', id, 'EDITAR', { antes: prev, despues: b });
  });
  const [row] = await query(`${SELECT_PRODUCTO} WHERE p.id = ?`, [id]);
  res.json(row);
});

router.patch('/productos/:id/precio', validate(idParam, 'params'),
  validate(z.object({ precio: productoSchema.shape.precio })), async (req, res) => {
    const { id } = req.valid.params; const { precio } = req.valid.body;
    await withTransaction(async (conn) => {
      const [[prev]] = await conn.query('SELECT precio FROM productos WHERE id = ? FOR UPDATE', [id]);
      if (!prev) throw notFound('Producto');
      await conn.query('UPDATE productos SET precio = ? WHERE id = ?', [precio, id]);
      await audit(conn, 'producto', id, 'CAMBIO_PRECIO', { precio_anterior: prev.precio, precio_nuevo: precio });
    });
    const [row] = await query(`${SELECT_PRODUCTO} WHERE p.id = ?`, [id]);
    res.json(row);
  });

router.patch('/productos/:id/estado', validate(idParam, 'params'),
  validate(z.object({ activo: z.boolean({ error: 'Indique activo true/false' }) })), async (req, res) => {
    const { id } = req.valid.params; const { activo } = req.valid.body;
    await withTransaction(async (conn) => {
      const [r] = await conn.query('UPDATE productos SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
      if (!r.affectedRows) throw notFound('Producto');
      await audit(conn, 'producto', id, activo ? 'ACTIVAR' : 'DESACTIVAR');
    });
    const [row] = await query(`${SELECT_PRODUCTO} WHERE p.id = ?`, [id]);
    res.json(row);
  });

// Solo se elimina físicamente si nunca se ha usado en un pedido; de lo contrario se debe desactivar.
router.delete('/productos/:id', validate(idParam, 'params'), async (req, res) => {
  const { id } = req.valid.params;
  await withTransaction(async (conn) => {
    const [[uso]] = await conn.query('SELECT COUNT(*) AS n FROM detalle_pedidos WHERE producto_id = ?', [id]);
    if (uso.n > 0) throw new HttpError(409, 'El producto tiene pedidos históricos; no se puede eliminar. Desactívelo en su lugar.', 'EN_USO');
    const [r] = await conn.query('DELETE FROM productos WHERE id = ?', [id]);
    if (!r.affectedRows) throw notFound('Producto');
    await audit(conn, 'producto', id, 'ELIMINAR');
  });
  res.json({ ok: true });
});

module.exports = router;
