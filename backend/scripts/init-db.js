// Ruta: backend/scripts/init-db.js
// Crea la base de datos y carga los datos iniciales sin necesidad de la consola de MySQL.
// Uso:  npm run db:init            (falla si ya hay pedidos registrados)
//       npm run db:init -- --force (BORRA y recrea todo)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');

(async () => {
  const force = process.argv.includes('--force');
  const dbName = process.env.DB_NAME || 'fincamarket';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true,
  });
  try {
    const [[ex]] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [dbName, 'pedidos']);
    if (ex.n && !force) {
      const [[c]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${dbName}\`.pedidos`);
      if (c.n > 0) {
        console.error(`\nLa base "${dbName}" ya tiene ${c.n} pedidos. No se modificó nada.`);
        console.error('Si realmente desea BORRAR todo y empezar de cero ejecute: npm run db:init -- --force\n');
        process.exit(1);
      }
    }
    const dir = path.resolve(__dirname, '../../database');
    const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8').replace(/fincamarket/g, dbName);
    const seed = fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8').replace(/USE fincamarket;/, `USE \`${dbName}\`;`);
    await conn.query(schema);
    await conn.query(seed);
    console.log(`\nBase de datos "${dbName}" creada con datos iniciales.\n`);
  } catch (e) {
    console.error('\nError inicializando la base de datos:', e.code || '', e.message);
    console.error('Verifique que MySQL/MariaDB esté iniciado (XAMPP) y los datos del archivo .env\n');
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
