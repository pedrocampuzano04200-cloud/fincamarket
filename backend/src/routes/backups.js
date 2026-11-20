// Ruta: backend/src/routes/backups.js
// Copias de seguridad y restauración de la base de datos usando mysqldump / mysql.
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { validate, z } = require('../middleware/validate');
const { HttpError } = require('../utils/helpers');
const { pool } = require('../config/db');

const BACKUP_DIR = path.resolve(__dirname, '../..', process.env.BACKUP_DIR || '../backups');
const NOMBRE_VALIDO = /^fincamarket_[\w-]+\.sql$/;

function dbArgs() {
  return [
    `--host=${process.env.DB_HOST || '127.0.0.1'}`, `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER || 'root'}`, '--default-character-set=utf8mb4',
  ];
}
function dbEnv() { return { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }; }
function stamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ejecutar(bin, args, { input, output } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(bin, args, { env: dbEnv(), windowsHide: true }); } catch (e) { reject(e); return; }
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => reject(new HttpError(500,
      `No se encontró el programa "${bin}". Revise MYSQLDUMP_PATH / MYSQL_PATH en el archivo .env (${e.code}).`, 'BIN_NO_ENCONTRADO')));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new HttpError(500, `Error de ${path.basename(bin)}: ${stderr.trim().slice(0, 400)}`, 'BACKUP_ERROR'))));
    if (output) child.stdout.pipe(output);
    if (input) fs.createReadStream(input).pipe(child.stdin);
  });
}

async function crearBackup(sufijo = '') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const nombre = `fincamarket_${stamp()}${sufijo}.sql`;
  const destino = path.join(BACKUP_DIR, nombre);
  const out = fs.createWriteStream(destino);
  try {
    await ejecutar(process.env.MYSQLDUMP_PATH || 'mysqldump',
      [...dbArgs(), '--single-transaction', '--routines', '--triggers', '--add-drop-table', process.env.DB_NAME || 'fincamarket'],
      { output: out });
  } catch (e) {
    out.close(); fs.rmSync(destino, { force: true }); throw e;
  }
  await new Promise((r) => out.end(r));
  return { nombre, tamano: fs.statSync(destino).size };
}

router.get('/', (_req, res) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => NOMBRE_VALIDO.test(f)).map((f) => {
    const st = fs.statSync(path.join(BACKUP_DIR, f));
    return { nombre: f, tamano: st.size, fecha: st.mtime };
  }).sort((a, b) => b.fecha - a.fecha);
  res.json({ carpeta: BACKUP_DIR, archivos: files });
});

router.post('/', async (_req, res) => {
  res.status(201).json(await crearBackup());
});

const nombreSchema = z.object({ nombre: z.string().regex(NOMBRE_VALIDO, 'Nombre de archivo inválido') });

router.get('/:nombre', validate(nombreSchema, 'params'), (req, res) => {
  const file = path.join(BACKUP_DIR, req.valid.params.nombre);
  if (!fs.existsSync(file)) throw new HttpError(404, 'El archivo de respaldo no existe.', 'NO_ENCONTRADO');
  res.download(file);
});

router.post('/:nombre/restaurar', validate(nombreSchema, 'params'),
  validate(z.object({ confirmacion: z.literal('RESTAURAR', { error: 'Escriba RESTAURAR para confirmar' }) })), async (req, res) => {
    const file = path.join(BACKUP_DIR, req.valid.params.nombre);
    if (!fs.existsSync(file)) throw new HttpError(404, 'El archivo de respaldo no existe.', 'NO_ENCONTRADO');
    // Respaldo automático del estado actual antes de restaurar.
    const previo = await crearBackup('_antes_de_restaurar');
    await ejecutar(process.env.MYSQL_PATH || 'mysql', [...dbArgs(), process.env.DB_NAME || 'fincamarket'], { input: file });
    await pool.query("INSERT INTO auditoria (entidad, accion, detalle) VALUES ('backup', 'RESTAURAR', ?)",
      [JSON.stringify({ archivo: req.valid.params.nombre, respaldo_previo: previo.nombre })]);
    res.json({ ok: true, restaurado: req.valid.params.nombre, respaldo_previo: previo.nombre });
  });

module.exports = router;
module.exports.crearBackup = crearBackup;
