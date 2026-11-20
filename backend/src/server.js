// Ruta: backend/src/server.js
// Punto de entrada del servidor.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const app = require('./app');
const { pool } = require('./config/db');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, async () => {
  console.log(`\n  FincaMarket en ejecución:  http://localhost:${PORT}\n`);
  try {
    await pool.query('SELECT 1');
    console.log('  Base de datos: conectada');
  } catch (e) {
    console.warn(`  ADVERTENCIA: no se pudo conectar a la base de datos (${e.code}).`);
    console.warn('  Inicie MySQL en XAMPP y verifique el archivo backend/.env\n');
  }
});

async function shutdown() {
  console.log('\nCerrando FincaMarket...');
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
