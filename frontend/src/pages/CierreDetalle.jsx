// Ruta: frontend/src/pages/CierreDetalle.jsx
// Detalle de un cierre: cuentas de cobro por apartamento, pagos, exportación y reapertura.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, FileDown, FileSpreadsheet, LockOpen, Eye, Wallet, Ban } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Badge, Kpi, Modal, Field, useAsync, useToast, useConfirm } from '../components/ui';
import { PedidoDetalle } from './Pedidos';
import { fmtMoney, fmtQty, fmtDate, fmtDateTime, today, aptoLabel, METODOS_PAGO, capital } from '../utils';

export default function CierreDetalle() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, loading, error, reload } = useAsync(() => api.get(`/cierres/${id}`), [id]);
  const [cuenta, setCuenta] = useState(null);

  async function reabrir() {
    const motivo = await confirm({
      title: `Reabrir cierre ${c.codigo}`, danger: true, confirmText: 'Reabrir cierre',
      message: 'Los pedidos del período quedarán liberados para corregirlos y luego deberá generar un nuevo cierre. '
        + 'Esta liquidación se conserva en el historial marcada como REABIERTA. Si hay pagos registrados, anúlelos primero.',
      input: { label: 'Motivo de la reapertura (queda en auditoría)', required: true, minLength: 5 },
    });
    if (!motivo) return;
    try { await api.post(`/cierres/${id}/reabrir`, { motivo }); toast.success('Cierre reabierto.'); reload(); } catch (e) { toast.error(e); }
  }

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !c) return <Loader />;
  const cuentas = c.unidades.flatMap((u) => u.apartamentos);

  return (
    <>
      <PageHeader title={`Liquidación ${c.codigo}`} subtitle={`Período ${fmtDate(c.fecha_inicio)} al ${fmtDate(c.fecha_fin)} · Generado ${fmtDateTime(c.created_at)}`}>
        <Link className="btn" to="/cierre">Volver</Link>
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
        <a className="btn" href={api.url(`/cierres/${id}/pdf`)} target="_blank" rel="noreferrer"><FileDown size={16} /> PDF</a>
        <a className="btn" href={api.url(`/cierres/${id}/excel`)}><FileSpreadsheet size={16} /> Excel</a>
        {c.estado === 'CERRADO' && <button className="btn btn-danger" onClick={reabrir}><LockOpen size={16} /> Reabrir</button>}
      </PageHeader>

      {c.estado === 'REABIERTO' && (
        <div className="alert alert-warn">Este cierre fue <b>reabierto</b> el {fmtDateTime(c.reabierto_at)}. Motivo: {c.motivo_reapertura}. Se conserva como registro histórico; no admite pagos.</div>
      )}

      <div className="print-only"><h2>Liquidación {c.codigo} — {fmtDate(c.fecha_inicio)} al {fmtDate(c.fecha_fin)}</h2></div>
      <div className="kpis">
        <Kpi label="Total general de la semana" value={fmtMoney(c.total_general)} icon={Wallet} />
        <Kpi label="Total recaudado" value={fmtMoney(c.recaudado)} icon={Wallet} tone="blue" />
        <Kpi label="Total por cobrar" value={fmtMoney(c.por_cobrar)} icon={Wallet} tone="amber" />
        <Kpi label="Pedidos / apartamentos" value={`${c.total_pedidos} / ${cuentas.length}`} icon={Eye} tone="gray" />
      </div>

      {c.unidades.map((u) => (
        <div className="card liq-unidad" key={u.unidad}>
          <h3>{u.unidad}</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Apartamento</th><th>Comprador(es)</th><th className="num">Pedidos</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Pago</th><th className="no-print" /></tr></thead>
            <tbody>{u.apartamentos.map((a) => (
              <tr key={a.detalle_cierre_id}>
                <td className="strong">{aptoLabel(a.apartamento)}</td><td>{a.clientes || '—'}</td><td className="num">{a.cantidad_pedidos}</td>
                <td className="num strong">{fmtMoney(a.total)}</td><td className="num">{fmtMoney(a.pagado)}</td>
                <td className={`num ${a.saldo > 0 ? 'err' : ''}`}>{fmtMoney(a.saldo)}</td>
                <td><Badge value={a.estado_pago} /></td>
                <td className="no-print"><div className="actions">
                  <button className="btn btn-sm" onClick={() => setCuenta(a)}><Eye size={15} /> Cuenta</button>
                  <a className="icon-btn" title="PDF cuenta de cobro" href={api.url(`/cierres/${id}/pdf`, { detalle: a.detalle_cierre_id })} target="_blank" rel="noreferrer"><FileDown size={17} /></a>
                </div></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3}>Subtotal {u.unidad}</td><td className="num">{fmtMoney(u.total)}</td><td colSpan={4} /></tr></tfoot>
          </table></div>
        </div>
      ))}
      <div className="grand-total mt"><span>TOTAL GENERAL DE LA SEMANA</span><span>{fmtMoney(c.total_general)}</span></div>
      {c.observaciones && <p className="muted">Observaciones: {c.observaciones}</p>}

      {cuenta && <CuentaModal cierreId={id} detalleId={cuenta.detalle_cierre_id} onClose={() => setCuenta(null)} onChange={reload} />}
    </>
  );
}

function CuentaModal({ cierreId, detalleId, onClose, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync(() => api.get(`/cierres/${cierreId}/cuentas/${detalleId}`), [cierreId, detalleId]);
  const [pago, setPago] = useState({ fecha: today(), monto: '', metodo: 'EFECTIVO', referencia: '' });
  const [saving, setSaving] = useState(false);
  const [pedido, setPedido] = useState(null);

  async function registrar() {
    const monto = Number(pago.monto);
    if (!monto || monto <= 0) { toast.error('Ingrese un monto mayor que cero.'); return; }
    if (monto > data.cuenta.saldo) { toast.error(`El monto supera el saldo pendiente (${fmtMoney(data.cuenta.saldo)}).`); return; }
    setSaving(true);
    try {
      await api.post('/pagos', { detalle_cierre_id: detalleId, ...pago, monto });
      toast.success('Pago registrado.');
      setPago({ ...pago, monto: '', referencia: '' });
      reload(); onChange();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }
  async function anular(p) {
    const motivo = await confirm({ title: 'Anular pago', danger: true, confirmText: 'Anular pago', message: `¿Anular el pago de ${fmtMoney(p.monto)} del ${fmtDate(p.fecha)}?`, input: { label: 'Motivo', required: true, minLength: 5 } });
    if (!motivo) return;
    try { await api.post(`/pagos/${p.id}/anular`, { motivo }); toast.success('Pago anulado.'); reload(); onChange(); } catch (e) { toast.error(e); }
  }

  const a = data?.cuenta;
  return (
    <Modal title="Cuenta de cobro" size="lg" onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
        <a className="btn" href={api.url(`/cierres/${cierreId}/pdf`, { detalle: detalleId })} target="_blank" rel="noreferrer"><FileDown size={16} /> PDF</a>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>}>
      <ErrorBox error={error} />
      {loading && !data ? <Loader /> : a && (
        <>
          <div className="row mb" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>{a.unidad} — {aptoLabel(a.apartamento)}</h2>
              <small className="muted">Cierre {data.cierre.codigo} · {fmtDate(data.cierre.fecha_inicio)} al {fmtDate(data.cierre.fecha_fin)}{a.clientes ? ` · ${a.clientes}` : ''}</small>
            </div>
            <Badge value={a.estado_pago} />
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Total</th></tr></thead>
            <tbody>{a.productos.map((p) => (
              <tr key={p.id}><td>{p.producto_nombre}</td><td className="num">{fmtQty(p.cantidad)} {p.unidad_medida}</td><td className="num">{fmtMoney(p.precio_unitario)}</td><td className="num">{fmtMoney(p.total)}</td></tr>
            ))}</tbody>
            <tfoot>
              <tr><td colSpan={3}>TOTAL A PAGAR</td><td className="num">{fmtMoney(a.total)}</td></tr>
              <tr><td colSpan={3}>Pagado</td><td className="num">{fmtMoney(a.pagado)}</td></tr>
              <tr><td colSpan={3}>Saldo pendiente</td><td className="num err">{fmtMoney(a.saldo)}</td></tr>
            </tfoot>
          </table></div>

          <h3 className="mt">Pedidos que conforman la liquidación</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Pedido</th><th>Fecha</th><th>Comprador</th><th className="num">Ítems</th><th className="num">Total</th><th className="no-print" /></tr></thead>
            <tbody>{data.pedidos.map((p) => (
              <tr key={p.id}><td className="strong">{p.numero}</td><td>{fmtDate(p.fecha)}</td><td>{p.cliente || '—'}</td><td className="num">{p.items}</td><td className="num">{fmtMoney(p.total)}</td>
                <td className="no-print"><button className="icon-btn" onClick={async () => setPedido(await api.get(`/pedidos/${p.id}`))}><Eye size={16} /></button></td></tr>
            ))}</tbody>
          </table></div>

          <h3 className="mt">Pagos</h3>
          {data.pagos.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th className="num">Monto</th><th>Estado</th><th className="no-print" /></tr></thead>
              <tbody>{data.pagos.map((p) => (
                <tr key={p.id} className={p.anulado ? 'inactive' : ''}><td>{fmtDate(p.fecha)}</td><td>{capital(p.metodo)}</td><td>{p.referencia}</td>
                  <td className="num">{fmtMoney(p.monto)}</td>
                  <td>{p.anulado ? <span title={p.motivo_anulacion}><Badge value="ANULADO" color="red" /></span> : <Badge value="APLICADO" color="green" />}</td>
                  <td className="no-print">{!p.anulado && data.cierre.estado === 'CERRADO' && <button className="icon-btn danger" title="Anular" onClick={() => anular(p)}><Ban size={16} /></button>}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="muted">Sin pagos registrados.</p>}

          {data.cierre.estado === 'CERRADO' && a.saldo > 0 && (
            <div className="card mt no-print" style={{ background: 'var(--green-50)' }}>
              <h3>Registrar pago</h3>
              <div className="filters mt">
                <Field label="Fecha"><input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} /></Field>
                <Field label="Monto"><input type="number" min="0" inputMode="numeric" value={pago.monto} placeholder={String(a.saldo)} onChange={(e) => setPago({ ...pago, monto: e.target.value })} /></Field>
                <Field label="Método"><select value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })}>{METODOS_PAGO.map((m) => <option key={m} value={m}>{capital(m)}</option>)}</select></Field>
                <Field label="Referencia"><input value={pago.referencia} maxLength={80} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} /></Field>
                <button className="btn" onClick={() => setPago({ ...pago, monto: String(a.saldo) })}>Saldo total</button>
                <button className="btn btn-primary" disabled={saving} onClick={registrar}><Wallet size={16} /> Registrar</button>
              </div>
            </div>
          )}
        </>
      )}
      {pedido && <PedidoDetalle p={pedido} onClose={() => setPedido(null)} />}
    </Modal>
  );
}
