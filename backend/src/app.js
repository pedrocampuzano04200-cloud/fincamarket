// Ruta: backend/src/app.js
// Configuración de Express: middlewares, rutas de la API y archivos estáticos del frontend.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'conectada', hora: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'sin conexión', error: e.code || e.message });
  }
});

app.use('/api', require('./routes/productos'));
app.use('/api', require('./routes/clientes'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/cierres', require('./routes/cierres'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', require('./routes/historial'));
app.use('/api', require('./routes/configuracion'));
app.use('/api/backups', require('./routes/backups'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada.', code: 'NO_ENCONTRADO' }));

// En producción el backend sirve el frontend compilado (frontend/dist).
const DIST = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
