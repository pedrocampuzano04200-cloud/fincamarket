// Ruta: backend/scripts/demo-data.js
// Genera datos de demostración (8 semanas de pedidos, cierres y pagos) para conocer el sistema.
// Requiere el servidor iniciado (npm start). Úselo SOLO en una base de datos de prueba.
// Uso:  npm run db:demo
const crypto = require('crypto');

const API = (process.env.API_URL || 'http://localhost:3001') + '/api';
const call = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(`${method} ${url}: ${data.error}`);
  return data;
};
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

(async () => {
  // Más apartamentos de ejemplo
  for (const [u, n] of [[1, '202'], [1, '301'], [1, '302'], [2, '401'], [2, '402'], [2, '501']]) {
    await call('POST', '/apartamentos', { unidad_id: u, numero: n }).catch(() => {});
  }
  const productos = (await call('GET', '/productos?activo=1'));
  const aptos = await call('GET', '/apartamentos');
  const hoy = new Date();
  const lunesActual = new Date(hoy); lunesActual.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  let pedidos = 0;
  for (let w = 7; w >= 0; w -= 1) {
    const lunes = new Date(lunesActual); lunes.setDate(lunesActual.getDate() - 7 * w);
    for (let d = 0; d < 7; d += 1) {
      const dia = new Date(lunes); dia.setDate(lunes.getDate() + d);
      if (dia > hoy) break;
      const n = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i += 1) {
        const items = [];
        const k = 1 + Math.floor(rnd() * 4);
        for (let j = 0; j < k; j += 1) {
          const p = pick(productos);
          items.push({ producto_id: p.id, cantidad: p.permite_decimales ? Math.round((0.5 + rnd() * 2.5) * 2) / 2 : 1 + Math.floor(rnd() * 3) });
        }
        const ped = await call('POST', '/pedidos', {
          clave_idempotencia: crypto.randomUUID(), fecha: iso(dia), apartamento_id: pick(aptos).id, items,
          estado: w > 0 ? 'ENTREGADO' : pick(['PENDIENTE', 'CONFIRMADO', 'ENTREGADO']), confirmar_duplicado: true,
        });
        pedidos += 1;
        if (rnd() < 0.05) await call('PATCH', `/pedidos/${ped.id}/estado`, { estado: 'CANCELADO', motivo: 'Demo: cliente canceló' });
      }
    }
    if (w > 0) {
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
      const cierre = await call('POST', '/cierres', { fecha_inicio: iso(lunes), fecha_fin: iso(domingo) });
      for (const c of cierre.unidades.flatMap((u) => u.apartamentos)) {
        const r = rnd();
        if (w > 1 && r < 0.85) await call('POST', '/pagos', { detalle_cierre_id: c.detalle_cierre_id, fecha: iso(domingo), monto: c.total, metodo: pick(['EFECTIVO', 'NEQUI', 'TRANSFERENCIA']) });
        else if (r < 0.4) await call('POST', '/pagos', { detalle_cierre_id: c.detalle_cierre_id, fecha: iso(domingo), monto: Math.round(c.total / 2), metodo: 'EFECTIVO' });
      }
    }
  }
  console.log(`Datos de demostración creados: ${pedidos} pedidos en 8 semanas (7 cerradas).`);
})().catch((e) => { console.error(e.message); process.exit(1); });
