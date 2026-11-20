// Ruta: frontend/src/pages/Dashboard.jsx
// Dashboard con indicadores, gráficos y tablas. Se actualiza automáticamente al cambiar filtros.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import {
  DollarSign, Calendar, ClipboardList, Users, Package, Wallet, TriangleAlert, Calculator, RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import { Kpi, Loader, ErrorBox, Empty, Badge, PageHeader, useAsync } from '../components/ui';
import { useCatalogos, UnidadSelect, AptoSelect, ProductoSelect } from '../components/selectors';
import { fmtMoney, fmtCompact, fmtQty, fmtDate, weekRange, monthRange, addDays, today, aptoLabel } from '../utils';

const COLORS = ['#2e7d32', '#66bb6a', '#a5d6a7', '#1b5e20', '#81c784', '#4caf50', '#9e9e9e'];
const money = (v) => fmtMoney(v);

export default function Dashboard() {
  const cat = useCatalogos();
  const [f, setF] = useState({ ...weekRange(), producto_id: '', unidad_id: '', apartamento_id: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v, ...(k === 'unidad_id' ? { apartamento_id: '' } : {}) }));
  const { data, loading, error, reload } = useAsync(() => api.get('/dashboard', f), [JSON.stringify(f)]);
  const rango = (r) => setF((s) => ({ ...s, ...r }));
  const semAnterior = weekRange(addDays(weekRange().desde, -1));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Resumen de ventas · ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`}>
        <button className="btn" onClick={reload}><RefreshCw size={16} /> Actualizar</button>
        <Link className="btn btn-primary" to="/registrar-pedido">Registrar pedido</Link>
      </PageHeader>

      <div className="card mb">
        <div className="row mb">
          <button className={`chip ${f.desde === today() && f.hasta === today() ? 'active' : ''}`} onClick={() => rango({ desde: today(), hasta: today() })}>Hoy</button>
          <button className={`chip ${f.desde === weekRange().desde && f.hasta === weekRange().hasta ? 'active' : ''}`} onClick={() => rango(weekRange())}>Esta semana</button>
          <button className={`chip ${f.desde === semAnterior.desde && f.hasta === semAnterior.hasta ? 'active' : ''}`} onClick={() => rango(semAnterior)}>Semana anterior</button>
          <button className="chip" onClick={() => rango(monthRange())}>Este mes</button>
          <button className="chip" onClick={() => rango({ desde: addDays(today(), -89), hasta: today() })}>Últimos 90 días</button>
        </div>
        <div className="filters">
          <label className="field"><span>Fecha inicial</span><input type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} /></label>
          <label className="field"><span>Fecha final</span><input type="date" value={f.hasta} min={f.desde} onChange={(e) => set('hasta', e.target.value)} /></label>
          <label className="field"><span>Semana</span>
            <input type="week" onChange={(e) => {
              if (!e.target.value) return;
              const [y, w] = e.target.value.split('-W').map(Number);
              const jan4 = new Date(y, 0, 4); const lunes1 = new Date(jan4); lunes1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
              const d = new Date(lunes1); d.setDate(lunes1.getDate() + (w - 1) * 7);
              rango(weekRange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`));
            }} />
          </label>
          <label className="field"><span>Producto</span><ProductoSelect productos={cat.productos} value={f.producto_id} onChange={(v) => set('producto_id', v)} /></label>
          <label className="field"><span>Unidad residencial</span><UnidadSelect unidades={cat.unidades} value={f.unidad_id} onChange={(v) => set('unidad_id', v)} /></label>
          <label className="field"><span>Apartamento</span><AptoSelect apartamentos={cat.apartamentos} unidadId={f.unidad_id} value={f.apartamento_id} onChange={(v) => set('apartamento_id', v)} /></label>
        </div>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {!data && loading && <Loader />}
      {data && <DashboardBody d={data} loading={loading} />}
    </>
  );
}

function DashboardBody({ d, loading }) {
  const k = d.kpis;
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
      <div className="kpis">
        <Kpi label="Ventas del día" value={fmtMoney(k.ventas_dia)} icon={DollarSign} />
        <Kpi label="Ventas de la semana" value={fmtMoney(k.ventas_semana)} icon={Calendar} />
        <Kpi label="Ventas del período" value={fmtMoney(k.ventas_periodo)} icon={DollarSign} tone="blue" hint={`${k.compradores_periodo} apartamentos compraron`} />
        <Kpi label="Pedidos del período" value={k.pedidos_periodo} icon={ClipboardList} tone="blue" />
        <Kpi label="Clientes registrados" value={k.clientes} icon={Users} tone="gray" hint={`${k.apartamentos} apartamentos`} />
        <Kpi label="Productos activos" value={k.productos_activos} icon={Package} tone="gray" />
        <Kpi label="Total pendiente de cobro" value={fmtMoney(k.por_cobrar)} icon={TriangleAlert} tone="amber" hint="Cierres con saldo" />
        <Kpi label="Total recaudado" value={fmtMoney(k.recaudado)} icon={Wallet} hint="Pagos en el período" />
        <Kpi label="Por liquidar" value={fmtMoney(k.por_liquidar)} icon={Calculator} tone="amber" hint="Pedidos sin cierre" />
      </div>

      <div className="grid grid-2">
        <ChartCard title="Ventas por día de la semana">
          <BarChart data={d.ventas_por_dia}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dia" tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis tickFormatter={fmtCompact} width={60} />
            <Tooltip formatter={money} />
            <Bar dataKey="total" name="Ventas" fill="#2e7d32" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Comparación de ventas entre semanas" subtitle="Últimas 8 semanas (inicio lunes)">
          <LineChart data={d.comparacion_semanas}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="etiqueta" />
            <YAxis tickFormatter={fmtCompact} width={60} />
            <Tooltip formatter={money} labelFormatter={(l) => `Semana del ${l}`} />
            <Line type="monotone" dataKey="total" name="Ventas" stroke="#2e7d32" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Productos más vendidos" subtitle="Por valor vendido" empty={!d.productos_mas_vendidos.length}>
          <BarChart data={d.productos_mas_vendidos} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtCompact} />
            <YAxis type="category" dataKey="nombre" width={110} />
            <Tooltip formatter={money} />
            <Bar dataKey="total" name="Ventas" fill="#43a047" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Productos menos vendidos" subtitle="Productos activos con menor venta">
          <BarChart data={d.productos_menos_vendidos} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtCompact} />
            <YAxis type="category" dataKey="nombre" width={110} />
            <Tooltip formatter={money} />
            <Bar dataKey="total" name="Ventas" fill="#a5d6a7" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Ventas por unidad residencial" empty={!d.ventas_por_unidad.length}>
          <BarChart data={d.ventas_por_unidad}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="nombre" />
            <YAxis tickFormatter={fmtCompact} width={60} />
            <Tooltip formatter={money} />
            <Bar dataKey="total" name="Ventas" fill="#1b5e20" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Distribución de ingresos por producto" empty={!d.distribucion_ingresos.length}>
          <PieChart>
            <Pie data={d.distribucion_ingresos} dataKey="total" nameKey="nombre" innerRadius={55} outerRadius={95} paddingAngle={2}>
              {d.distribucion_ingresos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => `${money(v)} (${d.total_productos ? Math.round((v / d.total_productos) * 100) : 0}%)`} />
            <Legend layout="vertical" align="right" verticalAlign="middle" />
          </PieChart>
        </ChartCard>
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <div className="card-head"><h2>Últimos pedidos registrados</h2><Link to="/pedidos" className="btn btn-sm">Ver todos</Link></div>
          {d.ultimos_pedidos.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th className="num">Total</th><th>Estado</th></tr></thead>
              <tbody>{d.ultimos_pedidos.map((p) => (
                <tr key={p.id}><td className="strong nowrap">{p.numero}</td><td className="nowrap">{fmtDate(p.fecha)}</td>
                  <td>{p.unidad} · {aptoLabel(p.apartamento)}</td><td className="num">{fmtMoney(p.total)}</td><td><Badge value={p.estado} /></td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Clientes con mayor volumen de compras</h2></div>
          {d.top_clientes.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>#</th><th>Unidad</th><th>Apartamento</th><th className="num">Pedidos</th><th className="num">Total</th></tr></thead>
              <tbody>{d.top_clientes.map((c, i) => (
                <tr key={c.apartamento_id}><td>{i + 1}</td><td>{c.unidad}</td><td>{aptoLabel(c.apartamento)}</td><td className="num">{c.pedidos}</td><td className="num strong">{fmtMoney(c.total)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Productos más vendidos</h2></div>
          {d.productos_mas_vendidos.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Pedidos</th><th className="num">Total</th></tr></thead>
              <tbody>{d.productos_mas_vendidos.map((p) => (
                <tr key={p.id}><td>{p.nombre}</td><td className="num">{fmtQty(p.cantidad)} {p.abreviatura}</td><td className="num">{p.pedidos}</td><td className="num strong">{fmtMoney(p.total)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Apartamentos con pagos pendientes</h2><Link to="/historial?tab=saldos" className="btn btn-sm">Ver saldos</Link></div>
          {d.pendientes_pago.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Cliente</th><th className="num">Cuentas</th><th>Desde</th><th className="num">Saldo</th></tr></thead>
              <tbody>{d.pendientes_pago.map((p) => (
                <tr key={p.apartamento_id}><td>{p.unidad} · <b>{aptoLabel(p.apartamento)}</b></td><td className="num">{p.cuentas}</td><td className="nowrap">{fmtDate(p.desde)}</td><td className="num strong err">{fmtMoney(p.saldo)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Sin saldos pendientes. ¡Todo al día!</Empty>}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="card">
      <div className="card-head"><div><h2>{title}</h2>{subtitle && <small className="muted">{subtitle}</small>}</div></div>
      {empty ? <Empty>Sin ventas en el período seleccionado.</Empty> : (
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
      )}
    </div>
  );
}
