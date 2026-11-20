// Ruta: backend/src/utils/helpers.js
// Utilidades compartidas: errores HTTP, auditoría, fechas y formato.

class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const notFound = (what = 'Registro') => new HttpError(404, `${what} no encontrado.`, 'NO_ENCONTRADO');

/** Registra una modificación importante en la tabla auditoria. */
async function audit(conn, entidad, entidadId, accion, detalle = null, motivo = null) {
  await conn.query(
    'INSERT INTO auditoria (entidad, entidad_id, accion, detalle, motivo) VALUES (?,?,?,?,?)',
    [entidad, entidadId, accion, detalle ? JSON.stringify(detalle) : null, motivo]
  );
}

const pad = (n) => String(n).padStart(2, '0');
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** Lunes y domingo de la semana que contiene la fecha dada. */
function weekRange(iso = todayISO()) {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  const start = new Date(d); start.setDate(d.getDate() - dow);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { desde: toISO(start), hasta: toISO(end) };
}
function addDays(iso, n) {
  const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d);
}

/** Redondeo monetario a 2 decimales evitando errores de coma flotante. */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const fmtMoney = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmtQty = (n) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const aptoLabel = (numero) => (numero ? `Apto ${numero}` : 'Sin especificar');

module.exports = {
  HttpError, notFound, audit, todayISO, weekRange, addDays, round2, fmtMoney, fmtQty, aptoLabel,
};
