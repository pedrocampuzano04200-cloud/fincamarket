// Ruta: backend/src/config/db.js
// Pool de conexiones MySQL/MariaDB y utilidad de transacciones.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fincamarket',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // fechas como 'YYYY-MM-DD' (sin corrimientos de zona horaria)
  decimalNumbers: true,   // DECIMAL -> Number
  charset: 'utf8mb4',
});

/**
 * Ejecuta `fn(conn)` dentro de una transacción.
 * Si fn lanza un error se hace ROLLBACK; si no, COMMIT.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* conexión caída */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, query, withTransaction };
