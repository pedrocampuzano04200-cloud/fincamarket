// Ruta: backend/scripts/test-api.js
// Pruebas funcionales de punta a punta contra la API en ejecución.
// ADVERTENCIA: crea datos de prueba. Ejecútelo sobre una base de datos de pruebas
// (npm run db:init -- --force) y con el servidor iniciado (npm start).
// Uso:  npm test        (API en http://localhost:3001 por defecto; cambie con API_URL)
const crypto = require('crypto');

const API = (process.env.API_URL || 'http://localhost:3001') + '/api';
let ok = 0; let fail = 0;

async function call(method, url, body) {
  const r = await fetch(API + url, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.arrayBuffer();
  return { status: r.status, data, ct };
}
function check(name, cond, extra) {
  if (cond) { ok += 1; console.log(`  ✔ ${name}`); } else { fail += 1; console.log(`  ✘ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}
const prod = (list, nombre) => list.find((p) => p.nombre === nombre).id;

(async () => {
  console.log(`\nProbando ${API}\n`);
  const { data: productos } = await call('GET', '/productos');
  const { data: aptos } = await call('GET', '/apartamentos');
  const apto = (unidad, num) => aptos.find((a) => a.unidad === unidad && (a.numero ?? null) === num).id;
  const P = (n) => prod(productos, n);
  const A101 = apto('Unidad Los Pinos', '101'); const A102 = apto('Unidad Los Pinos', '102');
  const A201 = apto('Unidad Los Pinos', '201'); const A301 = apto('Edificio Mirador', '301');
  const AMSE = apto('Edificio Mirador', null);

  console.log('Productos');
  let r = await call('POST', '/productos', { nombre: 'Lechuga crespa', categoria_id: 1, unidad_medida_id: 4, precio: 3000 });
  check('rechaza producto duplicado (409)', r.status === 409, r.data);
  r = await call('POST', '/productos', { nombre: 'Remolacha', categoria_id: 5, unidad_medida_id: 1, precio: -5 });
  check('rechaza precio negativo (400)', r.status === 400, r.data);
  r = await call('POST', '/productos', { nombre: 'Remolacha', categoria_id: 5, unidad_medida_id: 1, precio: 3500, descripcion: 'Roja' });
  check('crea producto nuevo', r.status === 201 && r.data.precio === 3500, r.data);
  const remolacha = r.data.id;
  r = await call('GET', '/productos?q=remo');
  check('búsqueda por nombre', r.data.length === 1 && r.data[0].nombre === 'Remolacha');

  console.log('Clientes y apartamentos');
  r = await call('POST', '/clientes', { unidad_id: 1, apartamento: '101', nombre: 'Ana Gómez', telefono: '3001234567' });
  check('crea cliente en apto existente', r.status === 201 && r.data.apartamento_id === A101, r.data);
  const anaId = r.data.id;
  r = await call('POST', '/clientes', { unidad_id: 1, apartamento: '101', nombre: 'Ana Gómez' });
  check('rechaza cliente duplicado (409)', r.status === 409);
  r = await call('POST', '/clientes', { unidad_id: 2, apartamento: '505', nombre: 'Luis' });
  check('crea apartamento nuevo al crear cliente', r.status === 201 && r.data.apartamento === '505', r.data);
  r = await call('POST', '/apartamentos', { unidad_id: 1, numero: '101' });
  check('rechaza apartamento duplicado (409)', r.status === 409);
  r = await call('POST', '/unidades', { nombre: 'Conjunto El Roble' });
  check('crea unidad con "Sin especificar" automático', r.status === 201);
  r = await call('GET', `/apartamentos?unidad_id=${r.data.id}`);
  check('unidad nueva tiene apto sin especificar', r.data.length === 1 && r.data[0].numero === null);

  console.log('Pedidos (semana 2026-11-09 a 2026-11-15)');
  const nuevo = (apartamento_id, fecha, items, extra = {}) => call('POST', '/pedidos', {
    clave_idempotencia: crypto.randomUUID(), fecha, apartamento_id, items, ...extra,
  });
  // Ejemplo del enunciado: apto 101 = $35.000
  r = await nuevo(A101, '2026-11-10', [
    { producto_id: P('Lechuga crespa'), cantidad: 2 }, { producto_id: P('Frijol'), cantidad: 1 },
    { producto_id: P('Pepino'), cantidad: 3 },
  ], { cliente_id: anaId });
  check('crea pedido y calcula total', r.status === 201 && r.data.total === 20000 && r.data.numero.startsWith('P-'), r.data);
  const ped1 = r.data;
  r = await nuevo(A101, '2026-11-12', [{ producto_id: P('Frijol'), cantidad: 1 }, { producto_id: P('Arveja'), cantidad: 1 }]);
  check('segundo pedido del apto 101', r.status === 201 && r.data.total === 15000, r.data);
  r = await nuevo(A102, '2026-11-11', [{ producto_id: P('Tomate'), cantidad: 2.5 }, { producto_id: P('Cilantro'), cantidad: 2 }, { producto_id: P('Zanahoria'), cantidad: 3 }]);
  check('pedido con decimales (kg) apto 102 = 22.000', r.status === 201 && r.data.total === 22000, r.data);
  r = await nuevo(A201, '2026-11-13', [{ producto_id: P('Zucchini'), cantidad: 4 }]);
  check('pedido apto 201 = 18.000', r.status === 201 && r.data.total === 18000, r.data);
  r = await nuevo(A301, '2026-11-14', [{ producto_id: P('Frijol'), cantidad: 3 }, { producto_id: P('Arveja'), cantidad: 1 }, { producto_id: P('Lechuga crespa'), cantidad: 1 }, { producto_id: P('Pepino'), cantidad: 2 }, { producto_id: P('Cebolla'), cantidad: 1.6 }]);
  check('pedido apto 301 = 42.000', r.status === 201 && r.data.total === 42000, r.data);
  r = await nuevo(AMSE, '2026-11-14', [{ producto_id: P('Cilantro'), cantidad: 1 }, { producto_id: P('Cilantro'), cantidad: 1 }]);
  check('consolida productos repetidos (2 manojos = 3.000)', r.status === 201 && r.data.detalle.length === 1 && r.data.total === 3000, r.data);
  const pedCancel = r.data.id;

  r = await nuevo(A101, '2026-11-10', [{ producto_id: P('Pepino'), cantidad: 1.5 }]);
  check('rechaza decimales en producto por unidad (400)', r.status === 400, r.data);
  r = await nuevo(A101, '2026-11-10', []);
  check('rechaza pedido sin productos (400)', r.status === 400);
  r = await call('POST', '/pedidos', { fecha: '2026-11-10', apartamento_id: A102, cliente_id: anaId, items: [{ producto_id: P('Frijol'), cantidad: 1 }] });
  check('rechaza cliente de otro apartamento (400)', r.status === 400, r.data);

  const key = crypto.randomUUID();
  const body = { clave_idempotencia: key, fecha: '2026-11-15', apartamento_id: A201, items: [{ producto_id: P('Tomate'), cantidad: 1 }] };
  const r1 = await call('POST', '/pedidos', body); const r2 = await call('POST', '/pedidos', body);
  check('idempotencia: doble envío no duplica', r1.status === 201 && r2.status === 200 && r1.data.id === r2.data.id);
  r = await nuevo(A201, '2026-11-15', [{ producto_id: P('Tomate'), cantidad: 1 }]);
  check('detecta posible pedido duplicado (409)', r.status === 409 && r.data.code === 'POSIBLE_DUPLICADO', r.data);
  await call('PATCH', `/pedidos/${r1.data.id}/estado`, { estado: 'CANCELADO', motivo: 'Prueba duplicado' });

  // Cambio de precio: el pedido anterior conserva el precio histórico.
  r = await call('PATCH', `/productos/${P('Frijol')}/precio`, { precio: 9000 });
  check('cambia precio del frijol a 9.000', r.status === 200 && r.data.precio === 9000);
  r = await call('GET', `/pedidos/${ped1.id}`);
  check('pedido anterior conserva precio histórico (8.000)', r.data.detalle.find((d) => d.producto_id === P('Frijol')).precio_unitario === 8000 && r.data.total === 20000, r.data.detalle);
  // Edición: agregar arveja. El frijol mantiene 8.000; la arveja nueva toma precio actual.
  r = await call('PUT', `/pedidos/${ped1.id}`, {
    fecha: ped1.fecha, apartamento_id: A101, cliente_id: anaId,
    items: [{ producto_id: P('Lechuga crespa'), cantidad: 2 }, { producto_id: P('Frijol'), cantidad: 1 }, { producto_id: P('Pepino'), cantidad: 3 }],
  });
  check('editar pedido mantiene precios históricos', r.status === 200 && r.data.total === 20000, r.data);
  await call('PATCH', `/productos/${P('Frijol')}/precio`, { precio: 8000 });

  r = await call('PATCH', `/pedidos/${pedCancel}/estado`, { estado: 'CANCELADO' });
  check('cancelar exige motivo (400)', r.status === 400);
  r = await call('PATCH', `/pedidos/${pedCancel}/estado`, { estado: 'CANCELADO', motivo: 'El cliente no estaba' });
  check('cancela pedido', r.status === 200 && r.data.estado === 'CANCELADO');
  r = await call('GET', `/pedidos?producto_id=${P('Zucchini')}`);
  check('consulta pedidos por producto', r.data.total === 1);

  console.log('Cierre semanal');
  r = await call('GET', '/cierres/preview?desde=2026-11-09&hasta=2026-11-15');
  const aptoTot = (liq, num) => liq.unidades.flatMap((u) => u.apartamentos).find((a) => a.apartamento === num)?.total;
  check('vista previa: total general 117.000 (excluye cancelados)', r.data.total_general === 117000, r.data.total_general);
  check('vista previa: apto 101 = 35.000 agrupando 2 pedidos', aptoTot(r.data, '101') === 35000);
  const frijol101 = r.data.unidades.flatMap((u) => u.apartamentos).find((a) => a.apartamento === '101').productos.find((p) => p.producto === 'Frijol');
  check('suma productos: frijol apto 101 = 2 kg = 16.000', frijol101.cantidad === 2 && frijol101.total === 16000, frijol101);
  r = await call('POST', '/cierres', { fecha_inicio: '2026-11-09', fecha_fin: '2026-11-15' });
  check('genera cierre', r.status === 201 && r.data.total_general === 117000 && r.data.estado === 'CERRADO', r.data);
  const cierre = r.data;
  const cuenta101 = cierre.unidades.flatMap((u) => u.apartamentos).find((a) => a.apartamento === '101');
  r = await call('POST', '/cierres', { fecha_inicio: '2026-11-12', fecha_fin: '2026-11-18' });
  check('rechaza cierre superpuesto (409)', r.status === 409);
  r = await call('PUT', `/pedidos/${ped1.id}`, { fecha: ped1.fecha, apartamento_id: A101, items: [{ producto_id: P('Frijol'), cantidad: 10 }] });
  check('pedido cerrado no se puede editar (409)', r.status === 409 && r.data.code === 'PEDIDO_CERRADO');
  r = await nuevo(A101, '2026-11-11', [{ producto_id: P('Frijol'), cantidad: 1 }]);
  check('no permite pedidos nuevos en período cerrado (409)', r.status === 409 && r.data.code === 'PERIODO_CERRADO');

  // El cambio de precio después del cierre no altera la fotografía
  await call('PATCH', `/productos/${P('Lechuga crespa')}/precio`, { precio: 5000 });
  r = await call('GET', `/cierres/${cierre.id}`);
  check('fotografía histórica no cambia con nuevos precios', r.data.total_general === 117000);

  console.log('Pagos');
  r = await call('POST', '/pagos', { detalle_cierre_id: cuenta101.detalle_cierre_id, fecha: '2026-11-16', monto: 50000 });
  check('rechaza sobrepago (400)', r.status === 400 && r.data.code === 'SOBREPAGO');
  r = await call('POST', '/pagos', { detalle_cierre_id: cuenta101.detalle_cierre_id, fecha: '2026-11-16', monto: 20000, metodo: 'NEQUI' });
  check('registra abono parcial', r.status === 201);
  const pagoId = r.data.id;
  r = await call('GET', `/cierres/${cierre.id}`);
  const c101 = r.data.unidades.flatMap((u) => u.apartamentos).find((a) => a.apartamento === '101');
  check('saldo y estado PARCIAL', c101.saldo === 15000 && c101.estado_pago === 'PARCIAL' && r.data.recaudado === 20000 && r.data.por_cobrar === 97000, c101);
  r = await call('POST', `/cierres/${cierre.id}/reabrir`, { motivo: 'Corrección de cantidades' });
  check('no reabre con pagos activos (409)', r.status === 409 && r.data.code === 'TIENE_PAGOS');
  r = await call('POST', `/pagos/${pagoId}/anular`, { motivo: 'Se registró por error' });
  check('anula pago', r.status === 200 && r.data.anulado === 1);

  console.log('Reapertura y ajuste');
  r = await call('POST', `/cierres/${cierre.id}/reabrir`, { motivo: 'Corrección de cantidades del 301' });
  check('reabre cierre', r.status === 200 && r.data.estado === 'REABIERTO');
  r = await call('PUT', `/pedidos/${ped1.id}`, { fecha: ped1.fecha, apartamento_id: A101, cliente_id: anaId, items: [{ producto_id: P('Lechuga crespa'), cantidad: 2 }, { producto_id: P('Frijol'), cantidad: 1 }, { producto_id: P('Pepino'), cantidad: 4 }] });
  check('pedido editable tras reabrir (+1 pepino)', r.status === 200 && r.data.total === 22000, r.data);
  r = await call('POST', '/cierres', { fecha_inicio: '2026-11-09', fecha_fin: '2026-11-15' });
  check('nuevo cierre con ajuste = 119.000', r.status === 201 && r.data.total_general === 119000, r.data.total_general);
  const cierre2 = r.data;
  r = await call('GET', `/cierres/${cierre.id}`);
  check('cierre reabierto conserva su fotografía (117.000)', r.data.total_general === 117000 && r.data.estado === 'REABIERTO');
  r = await call('GET', '/auditoria?entidad=cierre');
  check('auditoría registra cierre y reapertura', r.data.some((a) => a.accion === 'REABRIR') && r.data.filter((a) => a.accion === 'CERRAR').length === 2);
  const c2_101 = cierre2.unidades.flatMap((u) => u.apartamentos).find((a) => a.apartamento === '101');
  r = await call('POST', '/pagos', { detalle_cierre_id: c2_101.detalle_cierre_id, fecha: '2026-11-17', monto: 37000 });
  check('pago total del apto 101', r.status === 201);
  r = await call('GET', `/cierres/${cierre2.id}/cuentas/${c2_101.detalle_cierre_id}`);
  check('cuenta individual: PAGADO y 2 pedidos', r.data.cuenta.estado_pago === 'PAGADO' && r.data.pedidos.length === 2, r.data.cuenta);

  console.log('Exportaciones, dashboard e historial');
  r = await call('GET', `/cierres/${cierre2.id}/pdf`);
  check('PDF liquidación', r.status === 200 && r.ct.includes('pdf') && Buffer.from(r.data).subarray(0, 4).toString() === '%PDF');
  r = await call('GET', `/cierres/${cierre2.id}/pdf?detalle=${c2_101.detalle_cierre_id}`);
  check('PDF cuenta de cobro individual', r.status === 200 && r.ct.includes('pdf'));
  r = await call('GET', `/cierres/${cierre2.id}/excel`);
  check('Excel liquidación', r.status === 200 && Buffer.from(r.data).subarray(0, 2).toString() === 'PK');
  r = await call('GET', '/reportes/ventas.xlsx?desde=2026-11-01&hasta=2026-11-30');
  check('Excel reporte de ventas', r.status === 200 && Buffer.from(r.data).subarray(0, 2).toString() === 'PK');
  r = await call('GET', '/reportes/ventas.pdf?desde=2026-11-01&hasta=2026-11-30');
  check('PDF reporte de ventas', r.status === 200 && r.ct.includes('pdf'));
  r = await call('GET', '/dashboard?desde=2026-11-09&hasta=2026-11-17');
  check('dashboard: ventas del período = 119.000', r.data.kpis.ventas_periodo === 119000, r.data.kpis);
  check('dashboard: por cobrar 82.000 / recaudado 37.000', r.data.kpis.por_cobrar === 82000 && r.data.kpis.recaudado === 37000, r.data.kpis);
  check('dashboard: 7 días y 8 semanas', r.data.ventas_por_dia.length === 7 && r.data.comparacion_semanas.length === 8);
  r = await call('GET', `/dashboard?desde=2026-11-09&hasta=2026-11-15&unidad_id=2`);
  check('dashboard filtrado por unidad (Mirador = 42.000)', r.data.kpis.ventas_periodo === 42000, r.data.kpis.ventas_periodo);
  r = await call('GET', '/historial/ventas-semanales');
  check('historial semanal', r.data.length >= 1 && r.data[0].total === 119000, r.data);
  r = await call('GET', '/historial/saldos');
  check('saldos pendientes', r.data.reduce((s, x) => s + x.saldo, 0) === 82000);

  console.log('Validaciones y errores');
  r = await call('GET', '/pedidos?desde=2026-13-45');
  check('fecha inválida (400)', r.status === 400);
  r = await call('DELETE', `/productos/${P('Frijol')}`);
  check('no elimina producto con historial (409)', r.status === 409);
  r = await call('DELETE', `/productos/${remolacha}`);
  check('elimina producto sin historial', r.status === 200);
  r = await call('GET', '/no-existe');
  check('ruta inexistente (404)', r.status === 404);

  console.log('Copias de seguridad');
  r = await call('POST', '/backups');
  check('crea respaldo', r.status === 201 && r.data.tamano > 1000, r.data);

  console.log(`\nResultado: ${ok} correctas, ${fail} fallidas\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
