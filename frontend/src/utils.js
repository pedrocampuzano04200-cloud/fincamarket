// Ruta: frontend/src/utils.js
// Formatos de moneda, cantidades y fechas (es-CO) y utilidades de fechas.

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtMoney = (n) => money.format(Number(n) || 0);
export const fmtQty = (n) => qty.format(Number(n) || 0);
export const fmtCompact = (n) => `$${compact.format(Number(n) || 0)}`;

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => toISO(new Date());
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };

export function fmtDate(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const diaSemana = (iso) => parseISO(iso).toLocaleDateString('es-CO', { weekday: 'long' });

/** Lunes a domingo de la semana de la fecha dada. */
export function weekRange(iso = today()) {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7;
  const desde = addDays(iso, -dow);
  return { desde, hasta: addDays(desde, 6) };
}
export function monthRange(iso = today()) {
  const d = parseISO(iso);
  return { desde: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

export const aptoLabel = (numero) => (numero ? `Apto ${numero}` : 'Sin especificar');
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export const ESTADOS_PEDIDO = ['PENDIENTE', 'CONFIRMADO', 'ENTREGADO', 'CANCELADO'];
export const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'OTRO'];
export const capital = (s) => (s ? (s.charAt(0) + s.slice(1).toLowerCase()).replace(/_/g, ' ') : '');
