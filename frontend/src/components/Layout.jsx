// Ruta: frontend/src/components/Layout.jsx
// Estructura general: menú lateral + contenido. En tabletas el menú se despliega con un botón.
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Package, Building2, Calculator,
  History, FileChartColumn, Settings, Menu, Sprout,
} from 'lucide-react';
import { api } from '../api';

const MENU = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/registrar-pedido', label: 'Registrar pedido', icon: ShoppingCart },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/unidades', label: 'Unidades y apartamentos', icon: Building2 },
  { to: '/cierre', label: 'Cierre semanal', icon: Calculator },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/reportes', label: 'Reportes', icon: FileChartColumn },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [finca, setFinca] = useState('FincaMarket');
  const [dbOk, setDbOk] = useState(true);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    api.get('/configuracion').then((c) => setFinca(c.nombre_finca || 'FincaMarket')).catch(() => {});
    const check = () => fetch('/api/health').then((r) => setDbOk(r.ok)).catch(() => setDbOk(false));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`app ${open ? 'menu-open' : ''}`}>
      <aside className="sidebar no-print">
        <div className="brand">
          <Sprout size={28} />
          <div><strong>FincaMarket</strong><small>{finca}</small></div>
        </div>
        <nav>
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={19} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`db-status ${dbOk ? 'ok' : 'bad'}`}>
          <span className="dot" /> {dbOk ? 'Base de datos conectada' : 'Sin conexión a la base de datos'}
        </div>
      </aside>
      <div className="overlay no-print" onClick={() => setOpen(false)} />
      <main className="content">
        <header className="topbar no-print">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <strong>FincaMarket</strong>
        </header>
        {!dbOk && (
          <div className="alert alert-error no-print">
            No hay conexión con el servidor o la base de datos. Inicie MySQL en XAMPP y ejecute <b>iniciar.bat</b>.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
