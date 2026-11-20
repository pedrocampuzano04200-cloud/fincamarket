// Ruta: frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import Layout from './components/Layout';
import { ToastProvider, ConfirmProvider } from './components/ui';
import Dashboard from './pages/Dashboard';
import RegistrarPedido from './pages/RegistrarPedido';
import Pedidos from './pages/Pedidos';
import Productos from './pages/Productos';
import Unidades from './pages/Unidades';
import Cierre from './pages/Cierre';
import CierreDetalle from './pages/CierreDetalle';
import Historial from './pages/Historial';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="registrar-pedido" element={<RegistrarPedido />} />
              <Route path="pedidos/:id/editar" element={<RegistrarPedido />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="productos" element={<Productos />} />
              <Route path="unidades" element={<Unidades />} />
              <Route path="cierre" element={<Cierre />} />
              <Route path="cierre/:id" element={<CierreDetalle />} />
              <Route path="historial" element={<Historial />} />
              <Route path="reportes" element={<Reportes />} />
              <Route path="configuracion" element={<Configuracion />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
