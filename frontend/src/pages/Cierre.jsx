// Ruta: frontend/src/pages/Cierre.jsx
// Cierre semanal: vista previa de la liquidación, generación del cierre y listado de cierres.
import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, Eye, Lock, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Empty, Badge, useAsync, useToast, useConfirm } from '../components/ui';
import { fmtMoney, fmtQty, fmtDate, weekRange, addDays, aptoLabel } from '../utils';

export default function Cierre() {
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const anterior = weekRange(addDays(weekRange().desde, -1));
  const [rango, setRango] = useState(anterior);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [abiertos, setAbiertos] = useState({});
  const cierres = useAsync(() => api.get('/cierres'), []);

  async function calcular() {
    if (!rango.desde || !rango.hasta || rango.hasta < rango.desde) { toast.error('Seleccione un rango de fechas válido.'); return; }
    setLoading(true); setError(null);
    try { setPreview(await api.get('/cierres/preview', rango)); } catch (e) { setError(e); setPreview(null); } finally { setLoading(false); }
  }

  async function cerrar() {
    const ok = await confirm({
      title: 'Generar cierre semanal', confirmText: 'Generar cierre',
      message: `Se liquidarán ${preview.total_pedidos} pedidos por un total de ${fmtMoney(preview.total_general)}. `
        + 'Después del cierre los pedidos del período quedan bloqueados; para corregirlos se debe reabrir el cierre (queda registro en auditoría).',
    });
    if (!ok) return;
    try {
      const c = await api.post('/cierres', { fecha_inicio: rango.desde, fecha_fin: rango.hasta });
      toast.success(`Cierre ${c.codigo} generado.`);
      nav(`/cierre/${c.id}`);
    } catch (e) { toast.error(e); }
  }

  const bloqueado = preview && preview.cierres_solapados.length > 0;

  return (
    <>
      <PageHeader title="Cierre y liquidación semanal" subtitle="Agrupa los pedidos del período y genera la cuenta de cobro de cada apartamento." />
      <div className="card mb">
        <div className="filters">
          <label className="field"><span>Fecha inicial</span><input type="date" value={rango.desde} onChange={(e) => { setRango({ ...rango, desde: e.target.value }); setPreview(null); }} /></label>
          <label className="field"><span>Fecha final</span><input type="date" value={rango.hasta} min={rango.desde} onChange={(e) => { setRango({ ...rango, hasta: e.target.value }); setPreview(null); }} /></label>
          <button className="btn" onClick={() => { setRango(anterior); setPreview(null); }}>Semana anterior</button>
          <button className="btn" onClick={() => { setRango(weekRange()); setPreview(null); }}>Semana actual</button>
          <button className="btn btn-primary" onClick={calcular} disabled={loading}><Calculator size={16} /> {loading ? 'Calculando…' : 'Calcular liquidación'}</button>
        </div>
      </div>
      <ErrorBox error={error} />

      {preview && (
        <div className="card mb">
          <div className="card-head">
            <div><h2>Vista previa · {fmtDate(preview.desde)} al {fmtDate(preview.hasta)}</h2>
              <small className="muted">{preview.total_pedidos} pedidos válidos sin liquidar (los cancelados se excluyen)</small></div>
            <button className="btn btn-primary btn-lg" disabled={!preview.total_pedidos || bloqueado} onClick={cerrar}><Lock size={17} /> Generar cierre</button>
          </div>
          {bloqueado && <div className="alert alert-error"><TriangleAlert size={18} /> El período se superpone con {preview.cierres_solapados.map((c) => c.codigo).join(', ')}. Ajuste las fechas o reabra ese cierre.</div>}
          {preview.pedidos_ya_cerrados > 0 && <div className="alert alert-info">{preview.pedidos_ya_cerrados} pedido(s) del período ya pertenecen a un cierre anterior y no se incluyen.</div>}
          {preview.pedidos_pendientes > 0 && <div className="alert alert-warn"><TriangleAlert size={18} /> Hay {preview.pedidos_pendientes} pedido(s) en estado Pendiente. Se incluirán en la liquidación; verifique que se hayan entregado.</div>}
          {!preview.total_pedidos ? <Empty>No hay pedidos para liquidar en este período.</Empty> : (
            <>
              {preview.unidades.map((u) => (
                <div className="liq-unidad" key={u.unidad_id}>
                  <h3>{u.unidad}</h3>
                  <div className="table-wrap"><table>
                    <thead><tr><th style={{ width: 30 }} /><th>Apartamento</th><th>Comprador(es)</th><th className="num">Pedidos</th><th className="num">Total a pagar</th></tr></thead>
                    <tbody>{u.apartamentos.map((a) => {
                      const k = a.apartamento_id; const open = abiertos[k];
                      return (
                        <Fragment key={k}>
                          <tr className="clickable" onClick={() => setAbiertos({ ...abiertos, [k]: !open })}>
                            <td>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                            <td className="strong">{aptoLabel(a.apartamento)}</td><td>{a.clientes || '—'}</td>
                            <td className="num">{a.cantidad_pedidos}</td><td className="num strong">{fmtMoney(a.total)}</td>
                          </tr>
                          {open && (
                            <tr className="sub-row"><td /><td colSpan={4}><table>
                              <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Total</th></tr></thead>
                              <tbody>{a.productos.map((p, i) => (
                                <tr key={i}><td>{p.producto}</td><td className="num">{fmtQty(p.cantidad)} {p.abreviatura}</td><td className="num">{fmtMoney(p.precio_unitario)}</td><td className="num">{fmtMoney(p.total)}</td></tr>
                              ))}</tbody>
                            </table></td></tr>
                          )}
                        </Fragment>
                      );
                    })}</tbody>
                    <tfoot><tr><td /><td colSpan={3}>Subtotal {u.unidad}</td><td className="num">{fmtMoney(u.total)}</td></tr></tfoot>
                  </table></div>
                </div>
              ))}
              <div className="grand-total"><span>TOTAL GENERAL DEL PERÍODO</span><span>{fmtMoney(preview.total_general)}</span></div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>Cierres realizados</h2></div>
        <ErrorBox error={cierres.error} />
        {cierres.loading && !cierres.data ? <Loader /> : cierres.data?.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Código</th><th>Período</th><th>Estado</th><th className="num">Pedidos</th><th className="num">Aptos</th><th className="num">Total</th><th className="num">Recaudado</th><th className="num">Por cobrar</th><th /></tr></thead>
            <tbody>{cierres.data.map((c) => (
              <tr key={c.id} className={`clickable ${c.estado === 'REABIERTO' ? 'inactive' : ''}`} onClick={() => nav(`/cierre/${c.id}`)}>
                <td className="strong">{c.codigo}</td><td className="nowrap">{fmtDate(c.fecha_inicio)} – {fmtDate(c.fecha_fin)}</td>
                <td><Badge value={c.estado} /></td><td className="num">{c.total_pedidos}</td><td className="num">{c.apartamentos}</td>
                <td className="num strong">{fmtMoney(c.total_general)}</td><td className="num">{fmtMoney(c.recaudado)}</td>
                <td className={`num ${c.estado === 'CERRADO' && c.por_cobrar > 0 ? 'err strong' : ''}`}>{c.estado === 'CERRADO' ? fmtMoney(c.por_cobrar) : '—'}</td>
                <td><Link className="icon-btn" to={`/cierre/${c.id}`} onClick={(e) => e.stopPropagation()}><Eye size={17} /></Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Aún no se han realizado cierres.</Empty>}
      </div>
    </>
  );
}
