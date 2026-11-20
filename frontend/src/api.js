// Ruta: frontend/src/api.js
// Cliente HTTP de la API REST con manejo uniforme de errores.

export class ApiError extends Error {
  constructor(message, { status, code, detalles } = {}) {
    super(message);
    this.status = status; this.code = code; this.detalles = detalles;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor de FincaMarket. Verifique que esté en ejecución (iniciar.bat).', { code: 'SIN_SERVIDOR' });
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Error ${res.status}`, { status: res.status, code: data?.code, detalles: data?.detalles });
  }
  return data;
}

/** Construye un query string ignorando valores vacíos. */
export function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.append(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  /** URL directa para descargas (PDF / Excel). */
  url: (url, params) => `/api${url}${qs(params)}`,
};
