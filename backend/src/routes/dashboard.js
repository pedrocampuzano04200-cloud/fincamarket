// Ruta: backend/src/routes/dashboard.js
// Indicadores, gráficos y tablas del dashboard. Todo se calcula en vivo desde la base de datos.
const router = require('express').Router();
const { query } = require('../config/db');
const { validate, z, optId, optFecha } = require('../middleware/validate');
const { todayISO, weekRange, addDays, round2 } = require('../utils/helpers');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

router.get('/', validate(z.object({
  desde: optFecha, hasta: optFecha, producto_id: optId, unidad_id: optId, apartamento_id: optId,
}), 'query'), async (req, res) => {
  const f = req.valid.query;
  const hoy = todayISO();
  const semana = weekRange(hoy);
  const desde = f.desde || semana.desde;
  const hasta = f.hasta || semana.hasta;

  // Filtros comunes (excepto fechas) sobre ventas válidas.
  const fw = ["p.estado <> 'CANCELADO'"]; const fp = [];
  if (f.producto_id) { fw.push('d.producto_id = ?'); fp.push(f.producto_id); }
  if (f.unidad_id) { fw.push('a.unidad_id = ?'); fp.push(f.unidad_id); }
  if (f.apartamento_id) { fw.push('p.apartamento_id = ?'); fp.push(f.apartamento_id); }
  const BASE = `FROM pedidos p JOIN detalle_pedidos d ON d.pedido_id = p.id
                JOIN apartamentos a ON a.id = p.apartamento_id
                JOIN unidades_residenciales u ON u.id = a.unidad_id`;
  const W = fw.join(' AND ');
  const rango = [...fp, desde, hasta];
  const enRango = `${W} AND p.fecha BETWEEN ? AND ?`;

  // Filtros para saldos/pagos (por unidad/apartamento).
  const sw = []; const sp = [];
  if (f.unidad_id) { sw.push('a.unidad_id = ?'); sp.push(f.unidad_id); }
  if (f.apartamento_id) { sw.push('dc.apartamento_id = ?'); sp.push(f.apartamento_id); }
  const SW = sw.length ? ' AND ' + sw.join(' AND ') : '';

  const [
    [dia], [sem], [per], [cli], [prods], [porCobrar], [recaudado], [porLiquidar],
    porDiaSemana, diarias, productos, menos, porUnidad, semanas, ultimos, topClientes, pendientes,
  ] = await Promise.all([
    query(`SELECT COALESCE(SUM(d.subtotal),0) AS v ${BASE} WHERE ${W} AND p.fecha = ?`, [...fp, hoy]),
    query(`SELECT COALESCE(SUM(d.subtotal),0) AS v ${BASE} WHERE ${W} AND p.fecha BETWEEN ? AND ?`, [...fp, semana.desde, semana.hasta]),
    query(`SELECT COALESCE(SUM(d.subtotal),0) AS v, COUNT(DISTINCT p.id) AS pedidos, COUNT(DISTINCT p.apartamento_id) AS compradores ${BASE} WHERE ${enRango}`, rango),
    query('SELECT COUNT(*) AS clientes, (SELECT COUNT(*) FROM apartamentos WHERE activo = 1) AS apartamentos FROM clientes WHERE activo = 1'),
    query('SELECT COUNT(*) AS v FROM productos WHERE activo = 1'),
    query(`SELECT COALESCE(SUM(s.saldo),0) AS v FROM v_saldos_cierre s JOIN detalle_cierres dc ON dc.id = s.detalle_cierre_id
           JOIN cierres_semanales cs ON cs.id = s.cierre_id JOIN apartamentos a ON a.id = dc.apartamento_id
           WHERE cs.estado = 'CERRADO' ${SW}`, sp),
    query(`SELECT COALESCE(SUM(pg.monto),0) AS v FROM pagos pg JOIN detalle_cierres dc ON dc.id = pg.detalle_cierre_id
           JOIN apartamentos a ON a.id = dc.apartamento_id WHERE pg.anulado = 0 AND pg.fecha BETWEEN ? AND ? ${SW}`, [desde, hasta, ...sp]),
    query(`SELECT COALESCE(SUM(d.subtotal),0) AS v ${BASE} WHERE ${W} AND p.cierre_id IS NULL`, fp),
    query(`SELECT WEEKDAY(p.fecha) AS dia, SUM(d.subtotal) AS total, COUNT(DISTINCT p.id) AS pedidos ${BASE} WHERE ${enRango} GROUP BY WEEKDAY(p.fecha)`, rango),
    query(`SELECT p.fecha, SUM(d.subtotal) AS total ${BASE} WHERE ${enRango} GROUP BY p.fecha ORDER BY p.fecha`, rango),
    query(`SELECT pr.id, pr.nombre, um.abreviatura, SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS total, COUNT(DISTINCT p.id) AS pedidos
           ${BASE} JOIN productos pr ON pr.id = d.producto_id JOIN unidades_medida um ON um.id = pr.unidad_medida_id
           WHERE ${enRango} GROUP BY pr.id, pr.nombre, um.abreviatura ORDER BY total DESC`, rango),
    query(`SELECT pr.id, pr.nombre, um.abreviatura, COALESCE(v.cantidad,0) AS cantidad, COALESCE(v.total,0) AS total
           FROM productos pr JOIN unidades_medida um ON um.id = pr.unidad_medida_id
           LEFT JOIN (SELECT d.producto_id, SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS total ${BASE}
                      WHERE ${enRango} GROUP BY d.producto_id) v ON v.producto_id = pr.id
           WHERE pr.activo = 1 ${f.producto_id ? 'AND pr.id = ?' : ''} ORDER BY total ASC, pr.nombre LIMIT 5`,
    f.producto_id ? [...rango, f.producto_id] : rango),
    query(`SELECT u.id, u.nombre, SUM(d.subtotal) AS total, COUNT(DISTINCT p.id) AS pedidos ${BASE}
           WHERE ${enRango} GROUP BY u.id, u.nombre ORDER BY total DESC`, rango),
    query(`SELECT DATE_SUB(p.fecha, INTERVAL WEEKDAY(p.fecha) DAY) AS semana, SUM(d.subtotal) AS total, COUNT(DISTINCT p.id) AS pedidos
           ${BASE} WHERE ${W} AND p.fecha BETWEEN ? AND ? GROUP BY semana ORDER BY semana`,
    [...fp, addDays(weekRange(hasta).desde, -7 * 7), weekRange(hasta).hasta]),
    query(`SELECT p.id, p.numero, p.fecha, p.estado, u.nombre AS unidad, a.numero AS apartamento, t.total
           FROM pedidos p JOIN apartamentos a ON a.id = p.apartamento_id JOIN unidades_residenciales u ON u.id = a.unidad_id
           JOIN v_pedidos_totales t ON t.pedido_id = p.id
           WHERE p.fecha BETWEEN ? AND ?
             ${f.unidad_id ? 'AND a.unidad_id = ?' : ''} ${f.apartamento_id ? 'AND p.apartamento_id = ?' : ''}
             ${f.producto_id ? 'AND EXISTS (SELECT 1 FROM detalle_pedidos dx WHERE dx.pedido_id = p.id AND dx.producto_id = ?)' : ''}
           ORDER BY p.created_at DESC, p.id DESC LIMIT 10`,
    [desde, hasta, ...[f.unidad_id, f.apartamento_id, f.producto_id].filter(Boolean)]),
    query(`SELECT a.id AS apartamento_id, u.nombre AS unidad, a.numero AS apartamento, SUM(d.subtotal) AS total, COUNT(DISTINCT p.id) AS pedidos
           ${BASE} WHERE ${enRango} GROUP BY a.id, u.nombre, a.numero ORDER BY total DESC LIMIT 10`, rango),
    query(`SELECT dc.apartamento_id, dc.unidad_nombre AS unidad, dc.apartamento_numero AS apartamento,
                  SUM(s.saldo) AS saldo, COUNT(*) AS cuentas, MIN(cs.fecha_inicio) AS desde
           FROM v_saldos_cierre s JOIN detalle_cierres dc ON dc.id = s.detalle_cierre_id
           JOIN cierres_semanales cs ON cs.id = s.cierre_id JOIN apartamentos a ON a.id = dc.apartamento_id
           WHERE cs.estado = 'CERRADO' AND s.saldo > 0 ${SW}
           GROUP BY dc.apartamento_id, dc.unidad_nombre, dc.apartamento_numero ORDER BY saldo DESC LIMIT 20`, sp),
  ]);

  // Ventas por día de la semana (siempre 7 barras).
  const ventasPorDia = DIAS.map((nombre, i) => {
    const r = porDiaSemana.find((x) => x.dia === i);
    return { dia: nombre, total: r ? r.total : 0, pedidos: r ? r.pedidos : 0 };
  });

  // Comparación de las últimas 8 semanas (rellena semanas sin ventas).
  const ultimaSemana = weekRange(hasta).desde;
  const comparacion = [];
  for (let i = 7; i >= 0; i -= 1) {
    const ini = addDays(ultimaSemana, -7 * i);
    const r = semanas.find((s) => s.semana === ini);
    comparacion.push({ semana: ini, etiqueta: `${ini.slice(8, 10)}/${ini.slice(5, 7)}`, total: r ? r.total : 0, pedidos: r ? r.pedidos : 0 });
  }

  // Distribución de ingresos: 6 productos principales + "Otros".
  const totalProductos = productos.reduce((s, p) => round2(s + p.total), 0);
  const distribucion = productos.slice(0, 6).map((p) => ({ nombre: p.nombre, total: p.total }));
  const otros = round2(productos.slice(6).reduce((s, p) => s + p.total, 0));
  if (otros > 0) distribucion.push({ nombre: 'Otros', total: otros });

  res.json({
    filtros: { desde, hasta, ...f },
    kpis: {
      ventas_dia: dia.v, ventas_semana: sem.v, ventas_periodo: per.v,
      pedidos_periodo: per.pedidos, compradores_periodo: per.compradores,
      clientes: cli.clientes, apartamentos: cli.apartamentos, productos_activos: prods.v,
      por_cobrar: porCobrar.v, recaudado: recaudado.v, por_liquidar: porLiquidar.v,
    },
    ventas_por_dia: ventasPorDia,
    ventas_diarias: diarias,
    productos_mas_vendidos: productos.slice(0, 10),
    productos_menos_vendidos: menos,
    ventas_por_unidad: porUnidad,
    comparacion_semanas: comparacion,
    distribucion_ingresos: distribucion,
    total_productos: totalProductos,
    ultimos_pedidos: ultimos,
    top_clientes: topClientes,
    pendientes_pago: pendientes,
  });
});

module.exports = router;
