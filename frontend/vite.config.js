// Ruta: frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo las llamadas a /api se redirigen al backend Express.
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
