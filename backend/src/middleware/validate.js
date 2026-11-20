// Ruta: backend/src/middleware/validate.js
// Validación de entrada con zod. El resultado queda en req.valid.{body|query|params}.
const { z } = require('zod');

function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) return next(result.error);
    req.valid = req.valid || {};
    req.valid[source] = result.data;
    next();
  };
}

// Esquemas reutilizables
const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (use AAAA-MM-DD)')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inválida');
const idParam = z.object({ id: z.coerce.number().int().positive('ID inválido') });
const optId = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional());
const optStr = (max) => z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
  z.string().max(max, `Máximo ${max} caracteres`).nullable().optional());
const reqStr = (max, label) => z.string({ error: `${label} es obligatorio` }).trim()
  .min(1, `${label} es obligatorio`).max(max, `${label}: máximo ${max} caracteres`);
const optFecha = z.preprocess((v) => (v === '' ? undefined : v), fechaISO.optional());

module.exports = { validate, z, fechaISO, idParam, optId, optStr, reqStr, optFecha };
