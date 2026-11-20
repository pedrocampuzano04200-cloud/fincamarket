// Ruta: backend/src/services/pdf.js
// Generación de PDF: liquidación consolidada, cuentas de cobro individuales y reporte de ventas.
const PDFDocument = require('pdfkit');
const { fmtMoney, fmtQty, aptoLabel } = require('../utils/helpers');

const VERDE = '#2e7d32';
const GRIS = '#6b7280';
const M = 40; // margen

function nuevoDoc(res, filename) {
  const doc = new PDFDocument({ size: 'LETTER', margin: M, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

function encabezado(doc, cfg, titulo, subtitulo) {
  doc.rect(0, 0, doc.page.width, 70).fill(VERDE);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text(cfg.nombre_finca || 'FincaMarket', M, 18);
  const extra = [cfg.nit_finca && `NIT ${cfg.nit_finca}`, cfg.telefono_finca && `Tel. ${cfg.telefono_finca}`].filter(Boolean).join('  ·  ');
  doc.font('Helvetica').fontSize(9).text(extra || 'Productos frescos del campo', M, 42);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(14).text(titulo, M, 90);
  if (subtitulo) doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(subtitulo, M, doc.y + 2);
  doc.moveDown(0.8).fillColor('#111');
}

/** Dibuja una tabla con salto de página automático. */
function tabla(doc, cols, rows, { totalRow } = {}) {
  const width = doc.page.width - M * 2;
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const ws = cols.map((c) => (c.w / totalW) * width);
  const rowH = 18;
  const header = () => {
    let x = M; const y = doc.y;
    doc.rect(M, y, width, rowH).fill('#e8f5e9');
    doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(9);
    cols.forEach((c, i) => { doc.text(c.label, x + 4, y + 5, { width: ws[i] - 8, align: c.align || 'left' }); x += ws[i]; });
    doc.y = y + rowH; doc.fillColor('#111');
  };
  const line = (r, bold) => {
    if (doc.y + rowH > doc.page.height - M - 20) { doc.addPage(); header(); }
    let x = M; const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cols.forEach((c, i) => { doc.text(String(r[i] ?? ''), x + 4, y + 5, { width: ws[i] - 8, align: c.align || 'left', lineBreak: false, ellipsis: true }); x += ws[i]; });
    doc.moveTo(M, y + rowH).lineTo(M + width, y + rowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.y = y + rowH;
  };
  header();
  rows.forEach((r) => line(r));
  if (totalRow) line(totalRow, true);
  doc.x = M;
  doc.moveDown(0.6);
}

function pie(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor(GRIS)
      .text(`Generado por FincaMarket el ${new Date().toLocaleString('es-CO')}  ·  Página ${i + 1} de ${range.count}`,
        M, doc.page.height - M + 10, { width: doc.page.width - M * 2, align: 'center', lineBreak: false });
  }
}

function cuentaDeCobro(doc, cierre, a, cfg) {
  encabezado(doc, cfg, 'CUENTA DE COBRO', `Período: ${cierre.fecha_inicio} al ${cierre.fecha_fin}  ·  Cierre ${cierre.codigo}`);
  doc.font('Helvetica-Bold').fontSize(11).text(`${a.unidad}  —  ${aptoLabel(a.apartamento)}`);
  if (a.clientes) doc.font('Helvetica').fontSize(10).text(`Cliente(s): ${a.clientes}`);
  doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(`Pedidos incluidos: ${a.cantidad_pedidos}`).fillColor('#111');
  doc.moveDown(0.5);
  tabla(doc, [
    { label: 'Producto', w: 4 }, { label: 'Cantidad', w: 2.2, align: 'right' },
    { label: 'Precio unitario', w: 2, align: 'right' }, { label: 'Total', w: 2, align: 'right' },
  ], a.productos.map((p) => [p.producto_nombre, `${fmtQty(p.cantidad)} ${p.unidad_medida}`, fmtMoney(p.precio_unitario), fmtMoney(p.total)]),
  { totalRow: ['TOTAL A PAGAR', '', '', fmtMoney(a.total)] });
  doc.font('Helvetica').fontSize(10)
    .text(`Pagado: ${fmtMoney(a.pagado)}     Saldo pendiente: ${fmtMoney(a.saldo)}     Estado: ${a.estado_pago}`);
  if (cfg.mensaje_cuenta_cobro) doc.moveDown(1).fillColor(GRIS).fontSize(9).text(cfg.mensaje_cuenta_cobro).fillColor('#111');
}

function cierrePDF(res, cierre, cfg, detalleId) {
  const todas = cierre.unidades.flatMap((u) => u.apartamentos);
  if (detalleId) {
    const a = todas.find((x) => x.detalle_cierre_id === detalleId);
    const doc = nuevoDoc(res, `cuenta_${cierre.codigo}_${(a && a.apartamento) || 'sin-apto'}.pdf`);
    if (!a) doc.text('Cuenta de cobro no encontrada.'); else cuentaDeCobro(doc, cierre, a, cfg);
    pie(doc); doc.end(); return;
  }
  const doc = nuevoDoc(res, `liquidacion_${cierre.codigo}.pdf`);
  encabezado(doc, cfg, `LIQUIDACIÓN SEMANAL ${cierre.codigo}${cierre.estado === 'REABIERTO' ? ' (REABIERTO - ANULADO)' : ''}`,
    `Período: ${cierre.fecha_inicio} al ${cierre.fecha_fin}  ·  ${cierre.total_pedidos} pedidos`);
  for (const u of cierre.unidades) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(VERDE).text(u.unidad.toUpperCase()).fillColor('#111');
    tabla(doc, [
      { label: 'Apartamento', w: 2.5 }, { label: 'Cliente(s)', w: 3 }, { label: 'Pedidos', w: 1.4, align: 'right' },
      { label: 'Total', w: 2, align: 'right' }, { label: 'Pagado', w: 2, align: 'right' }, { label: 'Saldo', w: 2, align: 'right' },
    ], u.apartamentos.map((a) => [aptoLabel(a.apartamento), a.clientes || '', a.cantidad_pedidos, fmtMoney(a.total), fmtMoney(a.pagado), fmtMoney(a.saldo)]),
    { totalRow: ['Subtotal unidad', '', '', fmtMoney(u.total), '', ''] });
  }
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(13).text(`TOTAL GENERAL DE LA SEMANA: ${fmtMoney(cierre.total_general)}`);
  doc.font('Helvetica').fontSize(10).text(`Total recaudado: ${fmtMoney(cierre.recaudado)}     Total por cobrar: ${fmtMoney(cierre.por_cobrar)}`);
  // Una cuenta de cobro por página para entregar a cada apartamento.
  for (const a of todas) { doc.addPage(); cuentaDeCobro(doc, cierre, a, cfg); }
  pie(doc); doc.end();
}

function reporteVentasPDF(res, data, cfg) {
  const f = data.filtros;
  const doc = nuevoDoc(res, 'reporte_ventas.pdf');
  encabezado(doc, cfg, 'REPORTE DE VENTAS', `Período: ${f.desde || 'inicio'} al ${f.hasta || 'hoy'}`);
  const total = data.productos.reduce((s, p) => s + p.total, 0);
  doc.font('Helvetica-Bold').fontSize(12).text(`Total vendido: ${fmtMoney(total)}`).moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(VERDE).text('Ventas por semana').fillColor('#111');
  tabla(doc, [{ label: 'Semana', w: 3 }, { label: 'Pedidos', w: 1.4, align: 'right' }, { label: 'Apartamentos', w: 1.5, align: 'right' }, { label: 'Total', w: 2, align: 'right' }],
    data.semanal.map((s) => [`${s.semana} a ${s.semana_fin}`, s.pedidos, s.apartamentos, fmtMoney(s.total)]));
  doc.font('Helvetica-Bold').fontSize(11).fillColor(VERDE).text('Ventas por producto').fillColor('#111');
  tabla(doc, [{ label: 'Producto', w: 3 }, { label: 'Cantidad', w: 2, align: 'right' }, { label: 'Pedidos', w: 1.4, align: 'right' }, { label: 'Total', w: 2, align: 'right' }],
    data.productos.map((p) => [p.producto, `${fmtQty(p.cantidad)} ${p.unidad_medida.toLowerCase()}`, p.pedidos, fmtMoney(p.total)]),
    { totalRow: ['TOTAL', '', '', fmtMoney(total)] });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(VERDE).text('Compras por apartamento').fillColor('#111');
  tabla(doc, [{ label: 'Unidad', w: 3 }, { label: 'Apartamento', w: 2 }, { label: 'Pedidos', w: 1.4, align: 'right' }, { label: 'Total', w: 2, align: 'right' }, { label: 'Saldo pendiente', w: 2, align: 'right' }],
    data.apartamentos.map((a) => [a.unidad, aptoLabel(a.apartamento), a.pedidos, fmtMoney(a.total), fmtMoney(a.saldo_pendiente)]));
  pie(doc); doc.end();
}

module.exports = { cierrePDF, reporteVentasPDF };
