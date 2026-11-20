// Ruta: backend/src/routes/historial.js
// Consultas históricas y reportes exportables (Excel / PDF).
const router = require('express').Router();
const { query } = require('../config/db');
const { validate, z, optId, optFecha } = require('../middleware/validate');
const { reporteVentasExcel } = require('../services/excel');
const { reporteVentasPDF } = require('../services/pdf');
const { getConfig } = require('./configuracion');

const filtros = z.object({ desde: optFecha, hasta: optFecha, unidad_id: optId, apartamento_id: optId, producto_id: optId });

function whereVentas(f) {
  const w = ["p.estado <> 'CANCELADO'"]; const p = [];
  if (f.desde) { w.push('p.fecha >= ?'); p.push(f.desde); }
  if (f.hasta) { w.push('p.fecha <= ?'); p.push(f.hasta); }
  if (f.unidad_id) { w.push('a.unidad_id = ?'); p.push(f.unidad_id); }
  if (f.apartamento_id) { w.push('p.apartamento_id = ?'); p.push(f.apartamento_id); }
  if (f.producto_id) { w.push('d.producto_id = ?'); p.push(f.producto_id); }
  return { W: w.join(' AND '), P: p };
}
const BASE = `FROM pedidos p JOIN detalle_pedidos d ON d.pedido_id = p.id
  JOIN apartamentos a ON a.id = p.apartamento_id JOIN unidades_residenciales u ON u.id = a.unidad_id`;

const ventasSemanales = (f) => {
  const { W, P } = whereVentas(f);
  return query(`SELECT DATE_SUB(p.fecha, INTERVAL WEEKDAY(p.fecha) DAY) AS semana,
      DATE_ADD(DATE_SUB(p.fecha, INTERVAL WEEKDAY(p.fecha) DAY), INTERVAL 6 DAY) AS semana_fin,
      COUNT(DISTINCT p.id) AS pedidos, COUNT(DISTINCT p.apartamento_id) AS apartamentos, SUM(d.subtotal) AS total
    ${BASE} WHERE ${W} GROUP BY semana, semana_fin ORDER BY semana DESC`, P);
};
const ventasProductos = (f) => {
  const { W, P } = whereVentas(f);
  return query(`SELECT pr.id, pr.nombre AS producto, c.nombre AS categoria, um.nombre AS unidad_medida,
      SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS total, COUNT(DISTINCT p.id) AS pedidos,
      ROUND(SUM(d.subtotal) / SUM(d.cantidad), 2) AS precio_promedio
    ${BASE} JOIN productos pr ON pr.id = d.producto_id JOIN categorias_productos c ON c.id = pr.categoria_id
    JOIN unidades_medida um ON um.id = pr.unidad_medida_id
    WHERE ${W} GROUP BY pr.id, pr.nombre, c.nombre, um.nombre ORDER BY total DESC`, P);
};
const ventasApartamentos = (f) => {
  const { W, P } = whereVentas(f);
  return query(`SELECT a.id AS apartamento_id, u.nombre AS unidad, a.numero AS apartamento,
      COUNT(DISTINCT p.id) AS pedidos, SUM(d.subtotal) AS total, MAX(p.fecha) AS ultima_compra,
      (SELECT COALESCE(SUM(s.saldo),0) FROM v_saldos_cierre s JOIN cierres_semanales cs ON cs.id = s.cierre_id
        WHERE s.apartamento_id = a.id AND cs.estado = 'CERRADO') AS saldo_pendiente
    ${BASE} WHERE ${W} GROUP BY a.id, u.nombre, a.numero ORDER BY u.nombre, a.numero IS NULL, LPAD(a.numero,10,'0')`, P);
};
const saldos = (f) => {
  const w = ["cs.estado = 'CERRADO'", 's.saldo > 0']; const p = [];
  if (f.unidad_id) { w.push('a.unidad_id = ?'); p.push(f.unidad_id); }
  if (f.apartamento_id) { w.push('dc.apartamento_id = ?'); p.push(f.apartamento_id); }
  return query(`SELECT dc.id AS detalle_cierre_id, cs.id AS cierre_id, cs.codigo, cs.fecha_inicio, cs.fecha_fin,
      dc.unidad_nombre AS unidad, dc.apartamento_numero AS apartamento, dc.clientes_nombres AS clientes,
      dc.total, s.pagado, s.saldo
    FROM v_saldos_cierre s JOIN detalle_cierres dc ON dc.id = s.detalle_cierre_id
    JOIN cierres_semanales cs ON cs.id = s.cierre_id JOIN apartamentos a ON a.id = dc.apartamento_id
    WHERE ${w.join(' AND ')} ORDER BY cs.fecha_inicio, dc.unidad_nombre, dc.apartamento_numero`, p);
};

router.get('/historial/ventas-semanales', validate(filtros, 'query'), async (req, res) => res.json(await ventasSemanales(req.valid.query)));
router.get('/historial/productos', validate(filtros, 'query'), async (req, res) => res.json(await ventasProductos(req.valid.query)));
router.get('/historial/apartamentos', validate(filtros, 'query'), async (req, res) => res.json(await ventasApartamentos(req.valid.query)));
router.get('/historial/saldos', validate(filtros, 'query'), async (req, res) => res.json(await saldos(req.valid.query)));

/* ------------------------------- Reportes ------------------------------- */
async function datosReporte(f) {
  const { W, P } = whereVentas(f);
  const [semanal, productos, apartamentos, pendientes, detalle] = await Promise.all([
    ventasSemanales(f), ventasProductos(f), ventasApartamentos(f), saldos(f),
    query(`SELECT p.numero, p.fecha, p.estado, u.nombre AS unidad, a.numero AS apartamento, c.nombre AS cliente,
        pr.nombre AS producto, um.nombre AS unidad_medida, d.cantidad, d.precio_unitario, d.subtotal
      ${BASE} LEFT JOIN clientes c ON c.id = p.cliente_id JOIN productos pr ON pr.id = d.producto_id
      JOIN unidades_medida um ON um.id = d.unidad_medida_id WHERE ${W} ORDER BY p.fecha, p.id`, P),
  ]);
  return { filtros: f, semanal, productos, apartamentos, saldos: pendientes, detalle };
}

router.get('/reportes/ventas.xlsx', validate(filtros, 'query'), async (req, res) => {
  await reporteVentasExcel(res, await datosReporte(req.valid.query), await getConfig());
});
router.get('/reportes/ventas.pdf', validate(filtros, 'query'), async (req, res) => {
  reporteVentasPDF(res, await datosReporte(req.valid.query), await getConfig());
});

module.exports = router;
