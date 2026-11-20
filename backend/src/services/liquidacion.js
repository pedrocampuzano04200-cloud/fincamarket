// Ruta: backend/src/services/liquidacion.js
// Cálculo de la liquidación semanal (fuente única de verdad para la vista previa y el cierre).
const { round2 } = require('../utils/helpers');

/**
 * Calcula la liquidación de un período a partir de los pedidos válidos (no cancelados)
 * que aún no pertenecen a ningún cierre.
 * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool} db
 * @param {boolean} lock  true => bloquea las filas (SELECT ... FOR UPDATE) dentro de una transacción
 */
async function calcularLiquidacion(db, desde, hasta, lock = false) {
  const [rows] = await db.query(`
    SELECT p.id AS pedido_id, p.numero, p.fecha, p.estado, p.apartamento_id, a.numero AS apartamento,
           u.id AS unidad_id, u.nombre AS unidad, c.nombre AS cliente,
           d.producto_id, pr.nombre AS producto, um.nombre AS unidad_medida, um.abreviatura,
           d.cantidad, d.precio_unitario, d.subtotal
    FROM pedidos p
    JOIN detalle_pedidos d ON d.pedido_id = p.id
    JOIN apartamentos a ON a.id = p.apartamento_id
    JOIN unidades_residenciales u ON u.id = a.unidad_id
    LEFT JOIN clientes c ON c.id = p.cliente_id
    JOIN productos pr ON pr.id = d.producto_id
    JOIN unidades_medida um ON um.id = d.unidad_medida_id
    WHERE p.fecha BETWEEN ? AND ? AND p.estado <> 'CANCELADO' AND p.cierre_id IS NULL
    ORDER BY u.nombre, a.numero IS NULL, LPAD(a.numero, 10, '0'), pr.nombre
    ${lock ? 'FOR UPDATE' : ''}`, [desde, hasta]);

  const unidades = new Map();
  const pedidosIds = new Set();
  const pendientes = new Set();
  for (const r of rows) {
    pedidosIds.add(r.pedido_id);
    if (r.estado === 'PENDIENTE') pendientes.add(r.pedido_id);
    if (!unidades.has(r.unidad_id)) unidades.set(r.unidad_id, { unidad_id: r.unidad_id, unidad: r.unidad, total: 0, apartamentos: new Map() });
    const un = unidades.get(r.unidad_id);
    if (!un.apartamentos.has(r.apartamento_id)) {
      un.apartamentos.set(r.apartamento_id, {
        apartamento_id: r.apartamento_id, apartamento: r.apartamento, unidad: r.unidad,
        clientes: new Set(), pedidos: new Set(), total: 0, productos: new Map(),
      });
    }
    const ap = un.apartamentos.get(r.apartamento_id);
    if (r.cliente) ap.clientes.add(r.cliente);
    ap.pedidos.add(r.pedido_id);
    // Un mismo producto con precios distintos en la semana se muestra en líneas separadas.
    const key = `${r.producto_id}|${r.precio_unitario}|${r.unidad_medida}`;
    if (!ap.productos.has(key)) {
      ap.productos.set(key, {
        producto_id: r.producto_id, producto: r.producto, unidad_medida: r.unidad_medida, abreviatura: r.abreviatura,
        cantidad: 0, precio_unitario: r.precio_unitario, total: 0,
      });
    }
    const pr = ap.productos.get(key);
    pr.cantidad = Math.round((pr.cantidad + r.cantidad) * 1000) / 1000;
    pr.total = round2(pr.total + r.subtotal);
    ap.total = round2(ap.total + r.subtotal);
    un.total = round2(un.total + r.subtotal);
  }

  let totalGeneral = 0;
  const result = [...unidades.values()].map((u) => {
    totalGeneral = round2(totalGeneral + u.total);
    return {
      unidad_id: u.unidad_id, unidad: u.unidad, total: u.total,
      apartamentos: [...u.apartamentos.values()].map((a) => ({
        apartamento_id: a.apartamento_id, apartamento: a.apartamento, unidad: a.unidad,
        clientes: [...a.clientes].join(', ') || null,
        cantidad_pedidos: a.pedidos.size, pedido_ids: [...a.pedidos],
        total: a.total, productos: [...a.productos.values()],
      })),
    };
  });

  return {
    desde, hasta, total_general: totalGeneral, total_pedidos: pedidosIds.size,
    pedidos_pendientes: pendientes.size, pedido_ids: [...pedidosIds], unidades: result,
  };
}

module.exports = { calcularLiquidacion };
