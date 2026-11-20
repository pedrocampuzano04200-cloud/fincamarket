// Ruta: backend/src/services/excel.js
// Exportación a Excel (.xlsx) de liquidaciones y reportes de ventas.
const ExcelJS = require('exceljs');
const { aptoLabel } = require('../utils/helpers');

const MONEY = '"$"#,##0;[Red]-"$"#,##0';
const QTY = '#,##0.###';

function hoja(wb, nombre, columnas, filas, { totales } = {}) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width || 16, style: c.fmt ? { numFmt: c.fmt } : {} }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
  filas.forEach((f) => ws.addRow(f));
  if (totales && filas.length) {
    const row = ws.addRow({});
    row.getCell(1).value = 'TOTAL';
    totales.forEach((key) => {
      const idx = columnas.findIndex((c) => c.key === key) + 1;
      const letter = ws.getColumn(idx).letter;
      row.getCell(idx).value = { formula: `SUM(${letter}2:${letter}${filas.length + 1})` };
    });
    row.font = { bold: true };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

async function enviar(res, wb, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

async function cierreExcel(res, cierre, pedidos, cfg) {
  const wb = new ExcelJS.Workbook();
  wb.creator = cfg.nombre_finca || 'FincaMarket';
  const cuentas = cierre.unidades.flatMap((u) => u.apartamentos);
  hoja(wb, 'Resumen', [
    { header: 'Unidad residencial', key: 'unidad', width: 28 }, { header: 'Apartamento', key: 'apto', width: 16 },
    { header: 'Cliente(s)', key: 'clientes', width: 28 }, { header: 'Pedidos', key: 'pedidos', width: 10 },
    { header: 'Total', key: 'total', fmt: MONEY }, { header: 'Pagado', key: 'pagado', fmt: MONEY },
    { header: 'Saldo', key: 'saldo', fmt: MONEY }, { header: 'Estado pago', key: 'estado', width: 14 },
  ], cuentas.map((a) => ({
    unidad: a.unidad, apto: aptoLabel(a.apartamento), clientes: a.clientes || '', pedidos: a.cantidad_pedidos,
    total: a.total, pagado: a.pagado, saldo: a.saldo, estado: a.estado_pago,
  })), { totales: ['total', 'pagado', 'saldo'] });
  hoja(wb, 'Detalle por apartamento', [
    { header: 'Unidad residencial', key: 'unidad', width: 28 }, { header: 'Apartamento', key: 'apto', width: 16 },
    { header: 'Producto', key: 'producto', width: 24 }, { header: 'Unidad medida', key: 'um', width: 14 },
    { header: 'Cantidad', key: 'cantidad', fmt: QTY, width: 12 }, { header: 'Precio unitario', key: 'precio', fmt: MONEY },
    { header: 'Total', key: 'total', fmt: MONEY },
  ], cuentas.flatMap((a) => a.productos.map((p) => ({
    unidad: a.unidad, apto: aptoLabel(a.apartamento), producto: p.producto_nombre, um: p.unidad_medida,
    cantidad: p.cantidad, precio: p.precio_unitario, total: p.total,
  }))), { totales: ['total'] });
  hoja(wb, 'Pedidos', [
    { header: 'Pedido', key: 'numero', width: 12 }, { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 24 }, { header: 'Apartamento', key: 'apto', width: 14 }, { header: 'Cliente', key: 'cliente', width: 20 },
    { header: 'Producto', key: 'producto', width: 20 }, { header: 'Unidad medida', key: 'um', width: 12 },
    { header: 'Cantidad', key: 'cantidad', fmt: QTY, width: 10 }, { header: 'Precio', key: 'precio', fmt: MONEY }, { header: 'Subtotal', key: 'subtotal', fmt: MONEY },
  ], pedidos.map((p) => ({
    numero: p.numero, fecha: p.fecha, estado: p.estado, unidad: p.unidad, apto: aptoLabel(p.apartamento), cliente: p.cliente || '',
    producto: p.producto, um: p.unidad_medida, cantidad: p.cantidad, precio: p.precio_unitario, subtotal: p.subtotal,
  })), { totales: ['subtotal'] });
  await enviar(res, wb, `liquidacion_${cierre.codigo}.xlsx`);
}

async function reporteVentasExcel(res, data, cfg) {
  const wb = new ExcelJS.Workbook();
  wb.creator = cfg.nombre_finca || 'FincaMarket';
  hoja(wb, 'Ventas semanales', [
    { header: 'Semana (lunes)', key: 'semana', width: 14 }, { header: 'Hasta (domingo)', key: 'semana_fin', width: 14 },
    { header: 'Pedidos', key: 'pedidos', width: 10 }, { header: 'Apartamentos', key: 'apartamentos', width: 14 }, { header: 'Total', key: 'total', fmt: MONEY },
  ], data.semanal, { totales: ['total'] });
  hoja(wb, 'Por producto', [
    { header: 'Producto', key: 'producto', width: 24 }, { header: 'Categoría', key: 'categoria', width: 18 }, { header: 'Unidad medida', key: 'unidad_medida', width: 14 },
    { header: 'Cantidad', key: 'cantidad', fmt: QTY }, { header: 'Pedidos', key: 'pedidos', width: 10 },
    { header: 'Precio promedio', key: 'precio_promedio', fmt: MONEY }, { header: 'Total', key: 'total', fmt: MONEY },
  ], data.productos, { totales: ['total'] });
  hoja(wb, 'Por apartamento', [
    { header: 'Unidad', key: 'unidad', width: 26 }, { header: 'Apartamento', key: 'apto', width: 16 }, { header: 'Pedidos', key: 'pedidos', width: 10 },
    { header: 'Total comprado', key: 'total', fmt: MONEY }, { header: 'Última compra', key: 'ultima_compra', width: 14 },
    { header: 'Saldo pendiente', key: 'saldo_pendiente', fmt: MONEY },
  ], data.apartamentos.map((a) => ({ ...a, apto: aptoLabel(a.apartamento) })), { totales: ['total'] });
  hoja(wb, 'Saldos pendientes', [
    { header: 'Cierre', key: 'codigo', width: 14 }, { header: 'Desde', key: 'fecha_inicio', width: 12 }, { header: 'Hasta', key: 'fecha_fin', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 26 }, { header: 'Apartamento', key: 'apto', width: 16 },
    { header: 'Total', key: 'total', fmt: MONEY }, { header: 'Pagado', key: 'pagado', fmt: MONEY }, { header: 'Saldo', key: 'saldo', fmt: MONEY },
  ], data.saldos.map((s) => ({ ...s, apto: aptoLabel(s.apartamento) })), { totales: ['saldo'] });
  hoja(wb, 'Detalle de pedidos', [
    { header: 'Pedido', key: 'numero', width: 12 }, { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 24 }, { header: 'Apartamento', key: 'apto', width: 14 }, { header: 'Cliente', key: 'cliente', width: 20 },
    { header: 'Producto', key: 'producto', width: 20 }, { header: 'Unidad medida', key: 'unidad_medida', width: 12 },
    { header: 'Cantidad', key: 'cantidad', fmt: QTY, width: 10 }, { header: 'Precio', key: 'precio_unitario', fmt: MONEY }, { header: 'Subtotal', key: 'subtotal', fmt: MONEY },
  ], data.detalle.map((d) => ({ ...d, apto: aptoLabel(d.apartamento), cliente: d.cliente || '' })), { totales: ['subtotal'] });
  await enviar(res, wb, `reporte_ventas_${data.filtros.desde || 'inicio'}_${data.filtros.hasta || 'hoy'}.xlsx`);
}

module.exports = { cierreExcel, reporteVentasExcel };
