// Ruta: backend/src/middleware/errorHandler.js
// Manejo centralizado de errores: traduce errores técnicos a mensajes claros.
const { ZodError } = require('zod');
const { HttpError } = require('../utils/helpers');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const detalles = err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
    return res.status(400).json({
      error: detalles.map((d) => (d.campo ? `${d.campo}: ${d.mensaje}` : d.mensaje)).join(' | '),
      code: 'VALIDACION', detalles,
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, detalles: err.details });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.', code: 'JSON_INVALIDO' });
  }
  // Errores de MySQL/MariaDB
  switch (err && err.code) {
    case 'ER_DUP_ENTRY':
      return res.status(409).json({ error: 'Ya existe un registro con esos datos (registro duplicado).', code: 'DUPLICADO' });
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return res.status(409).json({ error: 'No se puede eliminar: el registro tiene información histórica asociada. Desactívelo en su lugar.', code: 'EN_USO' });
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return res.status(400).json({ error: 'Uno de los registros relacionados no existe.', code: 'REFERENCIA_INVALIDA' });
    case 'ER_CONSTRAINT_FAILED':
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return res.status(400).json({ error: 'Los datos no cumplen las restricciones (valores negativos o fechas inválidas).', code: 'RESTRICCION' });
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
      console.error('[DB]', err.code, err.message);
      return res.status(503).json({
        error: 'No hay conexión con la base de datos. Verifique que MySQL/MariaDB esté iniciado (XAMPP) y la configuración del archivo .env.',
        code: 'SIN_BASE_DATOS',
      });
    default:
      break;
  }
  console.error('[ERROR]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.', code: 'ERROR_INTERNO' });
}

module.exports = errorHandler;
