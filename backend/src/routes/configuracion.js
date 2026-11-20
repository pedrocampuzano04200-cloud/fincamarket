// Ruta: backend/src/routes/configuracion.js
// Datos generales de la finca (aparecen en cuentas de cobro y reportes) y auditoría.
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { validate, z, optStr, optId } = require('../middleware/validate');
const { audit } = require('../utils/helpers');

const CLAVES = ['nombre_finca', 'telefono_finca', 'nit_finca', 'mensaje_cuenta_cobro'];

async function getConfig() {
  const rows = await query('SELECT clave, valor FROM configuracion');
  const cfg = Object.fromEntries(rows.map((r) => [r.clave, r.valor ?? '']));
  return { nombre_finca: 'FincaMarket', ...cfg };
}

router.get('/configuracion', async (_req, res) => res.json(await getConfig()));

router.put('/configuracion', validate(z.object(Object.fromEntries(CLAVES.map((k) => [k, optStr(500)])))), async (req, res) => {
  const b = req.valid.body;
  await withTransaction(async (conn) => {
    for (const k of CLAVES) {
      if (b[k] !== undefined) {
        await conn.query('INSERT INTO configuracion (clave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [k, b[k]]);
      }
    }
    await audit(conn, 'configuracion', null, 'EDITAR', b);
  });
  res.json(await getConfig());
});

router.get('/auditoria', validate(z.object({
  entidad: z.string().trim().max(40).optional(), entidad_id: optId,
  limit: z.coerce.number().int().min(1).max(1000).default(200),
}), 'query'), async (req, res) => {
  const { entidad, entidad_id, limit } = req.valid.query;
  const where = []; const params = [];
  if (entidad) { where.push('entidad = ?'); params.push(entidad); }
  if (entidad_id) { where.push('entidad_id = ?'); params.push(entidad_id); }
  res.json(await query(`SELECT * FROM auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`, [...params, limit]));
});

module.exports = router;
module.exports.getConfig = getConfig;
