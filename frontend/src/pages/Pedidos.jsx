// Ruta: frontend/src/pages/Pedidos.jsx
// Consulta de pedidos por fecha, cliente, producto y estado; ver, editar, cambiar estado y cancelar.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Pencil, Ban, Lock, RotateCcw, Plus } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Empty, Badge, Modal, useAsync, useToast, useConfirm } from '../components/ui';
import { useCatalogos, UnidadSelect, AptoSelect, ProductoSelect } from '../components/selectors';
import { fmtMoney, fmtQty, fmtDate, fmtDateTime, weekRange, aptoLabel, ESTADOS_PEDIDO, capital } from '../utils';

export default function Pedidos() {
  const cat = useCatalogos();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [f, setF] = useState({ ...weekRange(), estado: 'TODOS', unidad_id: '', apartamento_id: '', producto_id: '', q: '', page: 1 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v, page: k === 'page' ? v : 1, ...(k === 'unidad_id' ? { apartamento_id: '' } : {}) }));
  const { data, loading, error, reload } = useAsync(() => api.get('/pedidos', { ...f, limit: 50 }), [JSON.stringify(f)]);
  const [ver, setVer] = useState(null);

  async function cambiarEstado(p, estado) {
    try {
      if (estado === 'CANCELADO') {
        const motivo = await confirm({
          title: `Cancelar pedido ${p.numero}`, danger: true, confirmText: 'Cancelar pedido',
          message: 'El pedido no se incluirá en la liquidación semanal. Esta acción queda registrada en auditoría.',
          input: { label: 'Motivo de la cancelación', required: true, minLength: 3 },
        });
        if (!motivo) return;
        await api.patch(`/pedidos/${p.id}/estado`, { estado, motivo });
      } else {
        if (p.estado === 'CANCELADO' && !(await confirm({ title: 'Reactivar pedido', message: `¿Reactivar el pedido ${p.numero} como ${capital(estado)}?` }))) return;
        await api.patch(`/pedidos/${p.id}/estado`, { estado });
      }
      toast.success(`Pedido ${p.numero}: ${capital(estado)}.`);
      reload();
      if (ver?.id === p.id) setVer(await api.get(`/pedidos/${p.id}`));
    } catch (e) { toast.error(e); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader title="Pedidos" subtitle="Consulte y gestione los pedidos registrados.">
        <Link to="/registrar-pedido" className="btn btn-primary"><Plus size={16} /> Nuevo pedido</Link>
      </PageHeader>
      <div className="card mb">
        <div className="filters">
          <label className="field"><span>Desde</span><input type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} /></label>
          <label className="field"><span>Hasta</span><input type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} /></label>
          <label className="field"><span>Estado</span>
            <select value={f.estado} onChange={(e) => set('estado', e.target.value)}>
              <option value="TODOS">Todos</option><option value="VALIDOS">Válidos (no cancelados)</option>
              {ESTADOS_PEDIDO.map((s) => <option key={s} value={s}>{capital(s)}</option>)}
            </select>
          </label>
          <label className="field"><span>Unidad</span><UnidadSelect unidades={cat.unidades} value={f.unidad_id} onChange={(v) => set('unidad_id', v)} /></label>
          <label className="field"><span>Apartamento</span><AptoSelect apartamentos={cat.apartamentos} unidadId={f.unidad_id} value={f.apartamento_id} onChange={(v) => set('apartamento_id', v)} /></label>
          <label className="field"><span>Producto</span><ProductoSelect productos={cat.productos} value={f.producto_id} onChange={(v) => set('producto_id', v)} /></label>
          <label className="field"><span>Buscar</span><input placeholder="N.º pedido, comprador…" value={f.q} onChange={(e) => set('q', e.target.value)} /></label>
          <button className="btn" onClick={() => setF((s) => ({ ...s, desde: '', hasta: '', page: 1 }))}>Todas las fechas</button>
        </div>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      <div className="card">
        {!data && loading ? <Loader /> : data && (
          <>
            <div className="card-head">
              <h2>{data.total} pedido(s)</h2>
              <span className="muted">Suma: <b>{fmtMoney(data.suma)}</b></span>
            </div>
            {data.data.length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>Pedido</th><th>Fecha</th><th>Unidad / Apto</th><th>Comprador</th><th className="num">Ítems</th><th className="num">Total</th><th>Estado</th><th>Cierre</th><th /></tr></thead>
                <tbody>{data.data.map((p) => (
                  <tr key={p.id} className={p.estado === 'CANCELADO' ? 'inactive' : ''}>
                    <td className="strong nowrap">{p.numero}</td>
                    <td className="nowrap">{fmtDate(p.fecha)}</td>
                    <td>{p.unidad}<br /><small className="muted">{aptoLabel(p.apartamento)}</small></td>
                    <td>{p.cliente || <span className="muted">—</span>}</td>
                    <td className="num">{p.items}</td>
                    <td className="num strong">{fmtMoney(p.total)}</td>
                    <td>
                      {p.cierre_estado === 'CERRADO' ? <Badge value={p.estado} /> : (
                        <select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value)} style={{ minWidth: 130, minHeight: 34, padding: '4px 8px' }}>
                          {ESTADOS_PEDIDO.map((s) => <option key={s} value={s}>{capital(s)}</option>)}
                        </select>
                      )}
                    </td>
                    <td>{p.cierre_codigo && p.cierre_estado === 'CERRADO' ? <Link to={`/cierre/${p.cierre_id}`} className="badge badge-green"><Lock size={11} /> {p.cierre_codigo}</Link> : <span className="muted">Abierto</span>}</td>
                    <td><div className="actions">
                      <button className="icon-btn" title="Ver detalle" onClick={async () => setVer(await api.get(`/pedidos/${p.id}`))}><Eye size={17} /></button>
                      <button className="icon-btn" title="Editar" disabled={p.cierre_estado === 'CERRADO' || p.estado === 'CANCELADO'} onClick={() => nav(`/pedidos/${p.id}/editar`)}><Pencil size={17} /></button>
                      {p.estado === 'CANCELADO'
                        ? <button className="icon-btn" title="Reactivar" disabled={p.cierre_estado === 'CERRADO'} onClick={() => cambiarEstado(p, 'PENDIENTE')}><RotateCcw size={17} /></button>
                        : <button className="icon-btn danger" title="Cancelar" disabled={p.cierre_estado === 'CERRADO'} onClick={() => cambiarEstado(p, 'CANCELADO')}><Ban size={17} /></button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <Empty>No hay pedidos con los filtros seleccionados.</Empty>}
            {pages > 1 && (
              <div className="row mt" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" disabled={f.page <= 1} onClick={() => set('page', f.page - 1)}>Anterior</button>
                <span className="muted">Página {f.page} de {pages}</span>
                <button className="btn btn-sm" disabled={f.page >= pages} onClick={() => set('page', f.page + 1)}>Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>
      {ver && <PedidoDetalle p={ver} onClose={() => setVer(null)} />}
    </>
  );
}

export function PedidoDetalle({ p, onClose }) {
  return (
    <Modal title={`Pedido ${p.numero}`} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={() => window.print()}>Imprimir</button><button className="btn btn-primary" onClick={onClose}>Cerrar</button></>}>
      <div className="form-grid mb">
        <div><small className="muted">Fecha</small><div className="strong">{fmtDate(p.fecha)}</div></div>
        <div><small className="muted">Cliente</small><div className="strong">{p.unidad} · {aptoLabel(p.apartamento)}</div>{p.cliente && <small>{p.cliente} {p.telefono}</small>}</div>
        <div><small className="muted">Estado</small><div><Badge value={p.estado} /></div></div>
        <div><small className="muted">Cierre</small><div>{p.cierre_codigo ? `${p.cierre_codigo} (${capital(p.cierre_estado)})` : 'Sin liquidar'}</div></div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Producto</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Precio unit.</th><th className="num">Subtotal</th></tr></thead>
        <tbody>{p.detalle.map((d) => (
          <tr key={d.id}><td>{d.producto}</td><td className="num">{fmtQty(d.cantidad)}</td><td>{d.unidad_medida}</td><td className="num">{fmtMoney(d.precio_unitario)}</td><td className="num">{fmtMoney(d.subtotal)}</td></tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={4}>Total del pedido</td><td className="num">{fmtMoney(p.total)}</td></tr></tfoot>
      </table></div>
      {p.observaciones && <p><b>Observaciones:</b> {p.observaciones}</p>}
      {p.motivo_cancelacion && <p className="err"><b>Motivo de cancelación:</b> {p.motivo_cancelacion}</p>}
      <p className="muted"><small>Creado: {fmtDateTime(p.created_at)} · Última modificación: {fmtDateTime(p.updated_at)}</small></p>
    </Modal>
  );
}
