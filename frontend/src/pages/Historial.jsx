// Ruta: frontend/src/pages/Historial.jsx
// Consulta de toda la información histórica.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Empty, Badge, useAsync } from '../components/ui';
import { useCatalogos, UnidadSelect, AptoSelect } from '../components/selectors';
import { PedidoDetalle } from './Pedidos';
import { fmtMoney, fmtQty, fmtDate, fmtDateTime, aptoLabel, capital } from '../utils';

const TABS = [
  ['semanas', 'Ventas por semana'], ['pedidos', 'Pedidos anteriores'], ['productos', 'Productos vendidos'],
  ['apartamento', 'Compras por apartamento'], ['liquidaciones', 'Liquidaciones'], ['pagos', 'Pagos realizados'],
  ['saldos', 'Saldos pendientes'], ['auditoria', 'Auditoría'],
];

export default function Historial() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'semanas';
  const cat = useCatalogos({ productos: false });
  const [f, setF] = useState({ desde: '', hasta: '', unidad_id: '', apartamento_id: Number(params.get('apartamento_id')) || '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v, ...(k === 'unidad_id' ? { apartamento_id: '' } : {}) }));
  return (
    <>
      <PageHeader title="Historial" subtitle="Toda la información histórica se conserva, incluso después de nuevos cierres." />
      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      {tab !== 'auditoria' && tab !== 'liquidaciones' && (
        <div className="card mb"><div className="filters">
          {tab !== 'saldos' && <>
            <label className="field"><span>Desde</span><input type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} /></label>
            <label className="field"><span>Hasta</span><input type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} /></label>
          </>}
          <label className="field"><span>Unidad</span><UnidadSelect unidades={cat.unidades} value={f.unidad_id} onChange={(v) => set('unidad_id', v)} /></label>
          <label className="field"><span>Apartamento</span><AptoSelect apartamentos={cat.apartamentos} unidadId={f.unidad_id} value={f.apartamento_id} onChange={(v) => set('apartamento_id', v)} /></label>
        </div></div>
      )}
      {tab === 'semanas' && <Semanas f={f} />}
      {tab === 'pedidos' && <PedidosHist f={f} />}
      {tab === 'productos' && <ProductosHist f={f} />}
      {tab === 'apartamento' && (f.apartamento_id ? <PedidosHist f={f} titulo /> : <Apartamentos f={f} onPick={(id) => set('apartamento_id', id)} />)}
      {tab === 'liquidaciones' && <Liquidaciones />}
      {tab === 'pagos' && <Pagos f={f} />}
      {tab === 'saldos' && <Saldos f={f} />}
      {tab === 'auditoria' && <Auditoria />}
    </>
  );
}

function Tabla({ state, head, row, foot, empty }) {
  const { data, loading, error, reload } = state;
  return (
    <div className="card">
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loader /> : data?.length ? (
        <div className="table-wrap"><table>
          <thead><tr>{head.map((h, i) => <th key={i} className={h.startsWith('#') ? 'num' : ''}>{h.replace('#', '')}</th>)}</tr></thead>
          <tbody>{data.map(row)}</tbody>
          {foot && <tfoot>{foot(data)}</tfoot>}
        </table></div>
      ) : <Empty>{empty}</Empty>}
    </div>
  );
}
const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0);

function Semanas({ f }) {
  const s = useAsync(() => api.get('/historial/ventas-semanales', f), [JSON.stringify(f)]);
  return <Tabla state={s} head={['Semana', '#Pedidos', '#Apartamentos', '#Total vendido']} empty="Sin ventas registradas."
    row={(w) => <tr key={w.semana}><td>{fmtDate(w.semana)} – {fmtDate(w.semana_fin)}</td><td className="num">{w.pedidos}</td><td className="num">{w.apartamentos}</td><td className="num strong">{fmtMoney(w.total)}</td></tr>}
    foot={(d) => <tr><td>Total</td><td className="num">{sum(d, 'pedidos')}</td><td /><td className="num">{fmtMoney(sum(d, 'total'))}</td></tr>} />;
}

function ProductosHist({ f }) {
  const s = useAsync(() => api.get('/historial/productos', f), [JSON.stringify(f)]);
  return <Tabla state={s} head={['Producto', 'Categoría', '#Cantidad', '#Pedidos', '#Precio promedio', '#Total']} empty="Sin productos vendidos."
    row={(p) => <tr key={p.id}><td className="strong">{p.producto}</td><td>{p.categoria}</td><td className="num">{fmtQty(p.cantidad)} {p.unidad_medida.toLowerCase()}</td><td className="num">{p.pedidos}</td><td className="num">{fmtMoney(p.precio_promedio)}</td><td className="num strong">{fmtMoney(p.total)}</td></tr>}
    foot={(d) => <tr><td colSpan={5}>Total</td><td className="num">{fmtMoney(sum(d, 'total'))}</td></tr>} />;
}

function Apartamentos({ f, onPick }) {
  const s = useAsync(() => api.get('/historial/apartamentos', f), [JSON.stringify(f)]);
  return <Tabla state={s} head={['Unidad', 'Apartamento', '#Pedidos', '#Total comprado', 'Última compra', '#Saldo pendiente', '']} empty="Sin compras."
    row={(a) => <tr key={a.apartamento_id} className="clickable" onClick={() => onPick(a.apartamento_id)}><td>{a.unidad}</td><td className="strong">{aptoLabel(a.apartamento)}</td><td className="num">{a.pedidos}</td><td className="num strong">{fmtMoney(a.total)}</td><td>{fmtDate(a.ultima_compra)}</td><td className={`num ${a.saldo_pendiente > 0 ? 'err' : ''}`}>{fmtMoney(a.saldo_pendiente)}</td><td><Eye size={16} /></td></tr>}
    foot={(d) => <tr><td colSpan={3}>Total</td><td className="num">{fmtMoney(sum(d, 'total'))}</td><td /><td className="num">{fmtMoney(sum(d, 'saldo_pendiente'))}</td><td /></tr>} />;
}

function PedidosHist({ f, titulo }) {
  const s = useAsync(() => api.get('/pedidos', { ...f, estado: 'TODOS', limit: 500 }).then((r) => r.data), [JSON.stringify(f)]);
  const [ver, setVer] = useState(null);
  return (
    <>
      {titulo && s.data?.[0] && <h2 className="mb">Compras de {s.data[0].unidad} · {aptoLabel(s.data[0].apartamento)}</h2>}
      <Tabla state={s} head={['Pedido', 'Fecha', 'Unidad / Apto', '#Ítems', '#Total', 'Estado', 'Cierre', '']} empty="Sin pedidos."
        row={(p) => <tr key={p.id} className={p.estado === 'CANCELADO' ? 'inactive' : ''}><td className="strong">{p.numero}</td><td>{fmtDate(p.fecha)}</td><td>{p.unidad} · {aptoLabel(p.apartamento)}</td><td className="num">{p.items}</td><td className="num">{fmtMoney(p.total)}</td><td><Badge value={p.estado} /></td>
          <td>{p.cierre_codigo ? <Link to={`/cierre/${p.cierre_id}`}>{p.cierre_codigo}</Link> : '—'}</td>
          <td><button className="icon-btn" onClick={async () => setVer(await api.get(`/pedidos/${p.id}`))}><Eye size={16} /></button></td></tr>}
        foot={(d) => <tr><td colSpan={4}>Total (sin cancelados)</td><td className="num">{fmtMoney(d.filter((p) => p.estado !== 'CANCELADO').reduce((s2, p) => s2 + p.total, 0))}</td><td colSpan={3} /></tr>} />
      {ver && <PedidoDetalle p={ver} onClose={() => setVer(null)} />}
    </>
  );
}

function Liquidaciones() {
  const s = useAsync(() => api.get('/cierres'), []);
  return <Tabla state={s} head={['Código', 'Período', 'Estado', '#Pedidos', '#Total', '#Recaudado', '#Por cobrar', '']} empty="Sin liquidaciones."
    row={(c) => <tr key={c.id} className={c.estado === 'REABIERTO' ? 'inactive' : ''}><td className="strong">{c.codigo}</td><td>{fmtDate(c.fecha_inicio)} – {fmtDate(c.fecha_fin)}</td><td><Badge value={c.estado} /></td><td className="num">{c.total_pedidos}</td><td className="num">{fmtMoney(c.total_general)}</td><td className="num">{fmtMoney(c.recaudado)}</td><td className="num">{c.estado === 'CERRADO' ? fmtMoney(c.por_cobrar) : '—'}</td><td><Link to={`/cierre/${c.id}`} className="icon-btn"><Eye size={16} /></Link></td></tr>} />;
}

function Pagos({ f }) {
  const s = useAsync(() => api.get('/pagos', { ...f, incluir_anulados: 1 }), [JSON.stringify(f)]);
  return <Tabla state={s} head={['Fecha', 'Cierre', 'Unidad', 'Apartamento', 'Método', 'Referencia', '#Monto', 'Estado']} empty="Sin pagos registrados."
    row={(p) => <tr key={p.id} className={p.anulado ? 'inactive' : ''}><td>{fmtDate(p.fecha)}</td><td><Link to={`/cierre/${p.cierre_id}`}>{p.cierre_codigo}</Link></td><td>{p.unidad}</td><td>{aptoLabel(p.apartamento)}</td><td>{capital(p.metodo)}</td><td>{p.referencia}</td><td className="num strong">{fmtMoney(p.monto)}</td><td>{p.anulado ? <span title={p.motivo_anulacion}><Badge value="ANULADO" color="red" /></span> : <Badge value="APLICADO" color="green" />}</td></tr>}
    foot={(d) => <tr><td colSpan={6}>Total recaudado (sin anulados)</td><td className="num">{fmtMoney(d.filter((p) => !p.anulado).reduce((x, p) => x + p.monto, 0))}</td><td /></tr>} />;
}

function Saldos({ f }) {
  const s = useAsync(() => api.get('/historial/saldos', f), [JSON.stringify(f)]);
  return <Tabla state={s} head={['Cierre', 'Período', 'Unidad', 'Apartamento', 'Comprador(es)', '#Total', '#Pagado', '#Saldo']} empty="No hay saldos pendientes."
    row={(x) => <tr key={x.detalle_cierre_id}><td><Link to={`/cierre/${x.cierre_id}`}>{x.codigo}</Link></td><td className="nowrap">{fmtDate(x.fecha_inicio)} – {fmtDate(x.fecha_fin)}</td><td>{x.unidad}</td><td className="strong">{aptoLabel(x.apartamento)}</td><td>{x.clientes}</td><td className="num">{fmtMoney(x.total)}</td><td className="num">{fmtMoney(x.pagado)}</td><td className="num strong err">{fmtMoney(x.saldo)}</td></tr>}
    foot={(d) => <tr><td colSpan={7}>Total por cobrar</td><td className="num">{fmtMoney(sum(d, 'saldo'))}</td></tr>} />;
}

function Auditoria() {
  const [entidad, setEntidad] = useState('');
  const s = useAsync(() => api.get('/auditoria', { entidad, limit: 300 }), [entidad]);
  return (
    <>
      <div className="card mb"><div className="filters">
        <label className="field"><span>Tipo de registro</span>
          <select value={entidad} onChange={(e) => setEntidad(e.target.value)}>
            <option value="">Todos</option>{['pedido', 'producto', 'cierre', 'pago', 'cliente', 'apartamento', 'unidad', 'configuracion', 'backup'].map((x) => <option key={x} value={x}>{capital(x)}</option>)}
          </select>
        </label>
      </div></div>
      <Tabla state={s} head={['Fecha', 'Registro', 'Acción', 'Motivo', 'Detalle']} empty="Sin registros."
        row={(a) => <tr key={a.id}><td className="nowrap">{fmtDateTime(a.created_at)}</td><td>{capital(a.entidad)} {a.entidad_id ? `#${a.entidad_id}` : ''}</td><td><Badge value={a.accion} color={['CANCELAR', 'REABRIR', 'ANULAR', 'ELIMINAR', 'RESTAURAR'].includes(a.accion) ? 'red' : 'gray'} /></td><td>{a.motivo}</td>
          <td><details><summary className="muted">ver</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: '.75rem', maxWidth: 520 }}>{a.detalle && JSON.stringify(JSON.parse(a.detalle), null, 1)}</pre></details></td></tr>} />
    </>
  );
}
