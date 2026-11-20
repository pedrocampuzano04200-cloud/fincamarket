// Ruta: frontend/src/pages/RegistrarPedido.jsx
// Registro y edición de pedidos con cálculo automático de subtotales y total.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2, Save, Search, TriangleAlert, Lock } from 'lucide-react';
import { api } from '../api';
import { useToast, useConfirm, PageHeader, Field, Loader, ErrorBox, Modal } from '../components/ui';
import { useCatalogos } from '../components/selectors';
import { fmtMoney, today, aptoLabel, uuid, ESTADOS_PEDIDO, capital, diaSemana } from '../utils';

const vacio = () => ({ fecha: today(), unidad_id: '', apartamento_id: '', cliente_id: '', estado: 'PENDIENTE', observaciones: '', items: [] });

export default function RegistrarPedido() {
  const { id } = useParams();
  const editando = Boolean(id);
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const cat = useCatalogos();
  const [form, setForm] = useState(vacio);
  const [clientes, setClientes] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [original, setOriginal] = useState(null);
  const [linea, setLinea] = useState({ producto_id: '', cantidad: '' });
  const [buscar, setBuscar] = useState('');
  const [nuevoApto, setNuevoApto] = useState(false);
  const [ultimo, setUltimo] = useState(null);
  const clave = useRef(uuid());
  const cantRef = useRef(null);

  // Carga del pedido a editar
  useEffect(() => {
    if (!editando) { setForm(vacio()); setOriginal(null); return; }
    api.get(`/pedidos/${id}`).then((p) => {
      setOriginal(p);
      setForm({
        fecha: p.fecha, unidad_id: p.unidad_id, apartamento_id: p.apartamento_id, cliente_id: p.cliente_id || '',
        estado: p.estado, observaciones: p.observaciones || '',
        items: p.detalle.map((d) => ({
          producto_id: d.producto_id, nombre: d.producto, unidad: d.abreviatura, permite_decimales: d.permite_decimales,
          cantidad: d.cantidad, precio: d.precio_unitario, precio_actual: d.precio_actual, historico: true,
        })),
      });
    }).catch(setLoadError);
  }, [id, editando]);

  // Clientes del apartamento seleccionado
  useEffect(() => {
    if (!form.apartamento_id) { setClientes([]); return; }
    api.get('/clientes', { apartamento_id: form.apartamento_id }).then(setClientes).catch(() => setClientes([]));
  }, [form.apartamento_id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const aptos = cat.apartamentos.filter((a) => a.unidad_id === Number(form.unidad_id) && (a.activo || a.id === form.apartamento_id));
  const activos = cat.productos.filter((p) => p.activo);
  const filtrados = activos.filter((p) => !buscar || p.nombre.toLowerCase().includes(buscar.toLowerCase()));
  const prodSel = activos.find((p) => p.id === Number(linea.producto_id));
  const total = useMemo(() => form.items.reduce((s, it) => s + Math.round(it.cantidad * it.precio * 100) / 100, 0), [form.items]);
  const bloqueado = original?.bloqueado;
  const cancelado = original?.estado === 'CANCELADO';

  function agregar(producto = prodSel, cantidad = linea.cantidad) {
    if (!producto) { setErrors({ linea: 'Seleccione un producto' }); return; }
    const cant = Number(String(cantidad).replace(',', '.'));
    if (!cant || cant <= 0) { setErrors({ linea: 'Ingrese una cantidad mayor que cero' }); cantRef.current?.focus(); return; }
    if (!producto.permite_decimales && !Number.isInteger(cant)) { setErrors({ linea: `${producto.nombre} se vende por ${producto.unidad_medida.toLowerCase()} entera` }); return; }
    setForm((f) => {
      const ex = f.items.find((i) => i.producto_id === producto.id);
      const items = ex
        ? f.items.map((i) => (i.producto_id === producto.id ? { ...i, cantidad: Math.round((i.cantidad + cant) * 1000) / 1000 } : i))
        : [...f.items, { producto_id: producto.id, nombre: producto.nombre, unidad: producto.abreviatura, permite_decimales: producto.permite_decimales, cantidad: cant, precio: producto.precio }];
      return { ...f, items };
    });
    setLinea({ producto_id: '', cantidad: '' }); setErrors({}); setBuscar('');
  }

  const cambiarCantidad = (pid, v) => setForm((f) => ({
    ...f, items: f.items.map((i) => (i.producto_id === pid ? { ...i, cantidad: v === '' ? '' : Number(v) } : i)),
  }));
  const quitar = (pid) => setForm((f) => ({ ...f, items: f.items.filter((i) => i.producto_id !== pid) }));

  function validar() {
    const e = {};
    if (!form.fecha) e.fecha = 'Indique la fecha del pedido';
    if (!form.unidad_id) e.unidad_id = 'Seleccione la unidad residencial';
    if (!form.apartamento_id) e.apartamento_id = 'Seleccione el apartamento o "Sin especificar"';
    if (!form.items.length) e.items = 'Agregue al menos un producto';
    form.items.forEach((i) => {
      if (!(i.cantidad > 0)) e.items = `Cantidad inválida para ${i.nombre}`;
      else if (!i.permite_decimales && !Number.isInteger(i.cantidad)) e.items = `${i.nombre} solo admite cantidades enteras`;
    });
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function guardar(confirmarDuplicado = false) {
    if (!validar()) { toast.error('Revise los campos marcados.'); return; }
    setSaving(true);
    const body = {
      fecha: form.fecha, apartamento_id: Number(form.apartamento_id), cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      estado: form.estado === 'CANCELADO' ? undefined : form.estado, observaciones: form.observaciones,
      items: form.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    };
    try {
      if (editando) {
        await api.put(`/pedidos/${id}`, body);
        toast.success('Pedido actualizado.');
        nav('/pedidos');
      } else {
        const p = await api.post('/pedidos', { ...body, clave_idempotencia: clave.current, confirmar_duplicado: confirmarDuplicado });
        toast.success(`Pedido ${p.numero} registrado por ${fmtMoney(p.total)}.`);
        setUltimo(p);
        clave.current = uuid();
        // Se conservan fecha y unidad para registrar rápidamente el siguiente pedido.
        setForm((f) => ({ ...vacio(), fecha: f.fecha, unidad_id: f.unidad_id }));
      }
    } catch (e) {
      if (e.code === 'POSIBLE_DUPLICADO') {
        setSaving(false);
        if (await confirm({ title: 'Posible pedido duplicado', message: e.message, confirmText: 'Sí, registrar' })) guardar(true);
        return;
      }
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <ErrorBox error={loadError} />;
  if (cat.loading || (editando && !original)) return <Loader />;

  return (
    <>
      <PageHeader title={editando ? `Editar pedido ${original.numero}` : 'Registrar pedido'}
        subtitle={editando ? `Registrado el ${original.created_at}` : 'Seleccione el cliente, agregue productos y guarde.'}>
        <Link to="/pedidos" className="btn">Ver pedidos</Link>
      </PageHeader>

      {bloqueado && <div className="alert alert-warn"><Lock size={18} /> Este pedido pertenece al cierre {original.cierre_codigo}, que está cerrado. Para modificarlo reabra el cierre desde "Cierre semanal".</div>}
      {cancelado && <div className="alert alert-warn"><TriangleAlert size={18} /> Pedido cancelado. Para editarlo, reactívelo primero desde la lista de pedidos.</div>}
      {ultimo && !editando && (
        <div className="alert alert-ok">Último pedido guardado: <b>{ultimo.numero}</b> · {ultimo.unidad} · {aptoLabel(ultimo.apartamento)} · <b>{fmtMoney(ultimo.total)}</b></div>
      )}

      <fieldset disabled={bloqueado || cancelado} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="order-layout">
          <div>
            <div className="card">
              <div className="card-head"><h2>1. Cliente</h2></div>
              <div className="form-grid">
                <Field label="Fecha del pedido" error={errors.fecha} hint={form.fecha && capital(diaSemana(form.fecha))}>
                  <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
                </Field>
                <Field label="Unidad residencial *" error={errors.unidad_id}>
                  <select value={form.unidad_id} onChange={(e) => setForm((f) => ({ ...f, unidad_id: Number(e.target.value) || '', apartamento_id: '', cliente_id: '' }))}>
                    <option value="">Seleccione…</option>
                    {cat.unidades.filter((u) => u.activo || u.id === form.unidad_id).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </Field>
                <Field label="Apartamento *" error={errors.apartamento_id}>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                    <select value={form.apartamento_id} disabled={!form.unidad_id}
                      onChange={(e) => setForm((f) => ({ ...f, apartamento_id: Number(e.target.value) || '', cliente_id: '' }))}>
                      <option value="">Seleccione…</option>
                      {aptos.map((a) => <option key={a.id} value={a.id}>{aptoLabel(a.numero)}</option>)}
                    </select>
                    <button type="button" className="btn" title="Nuevo apartamento" disabled={!form.unidad_id} onClick={() => setNuevoApto(true)}><Plus size={16} /></button>
                  </div>
                </Field>
                <Field label="Comprador (opcional)">
                  <select value={form.cliente_id} disabled={!form.apartamento_id} onChange={(e) => set('cliente_id', Number(e.target.value) || '')}>
                    <option value="">{clientes.length ? 'Sin especificar' : 'No hay compradores registrados'}</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre || 'Sin nombre'}{c.telefono ? ` · ${c.telefono}` : ''}</option>)}
                  </select>
                </Field>
                <Field label="Estado">
                  <select value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                    {ESTADOS_PEDIDO.filter((s) => s !== 'CANCELADO').map((s) => <option key={s} value={s}>{capital(s)}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h2>2. Productos</h2></div>
              <div className="add-line">
                <Field label="Producto" error={errors.linea}>
                  <select value={linea.producto_id} onChange={(e) => { setLinea((l) => ({ ...l, producto_id: e.target.value })); setTimeout(() => cantRef.current?.focus(), 0); }}>
                    <option value="">Seleccione un producto…</option>
                    {filtrados.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {fmtMoney(p.precio)} / {p.abreviatura}</option>)}
                  </select>
                </Field>
                <Field label={`Cantidad${prodSel ? ` (${prodSel.abreviatura})` : ''}`}>
                  <input ref={cantRef} type="number" inputMode="decimal" min="0" step={prodSel?.permite_decimales ? '0.1' : '1'}
                    value={linea.cantidad} onChange={(e) => setLinea((l) => ({ ...l, cantidad: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
                </Field>
                <button type="button" className="btn btn-primary" onClick={() => agregar()}><Plus size={16} /> Agregar</button>
              </div>
              <div className="row mt" style={{ gap: 8 }}>
                <Search size={16} className="muted" />
                <input style={{ maxWidth: 260 }} placeholder="Filtrar productos…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
                <small className="muted">o toque un producto para agregar 1:</small>
              </div>
              <div className="product-grid">
                {filtrados.slice(0, 30).map((p) => (
                  <button type="button" key={p.id} className="chip" onClick={() => agregar(p, 1)}>{p.nombre}</button>
                ))}
              </div>

              <div className="table-wrap mt">
                <table>
                  <thead><tr><th>Producto</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Precio unit.</th><th className="num">Subtotal</th><th /></tr></thead>
                  <tbody>
                    {form.items.map((i) => (
                      <tr key={i.producto_id}>
                        <td className="strong">{i.nombre}
                          {i.historico && i.precio_actual !== i.precio && <div><small className="muted">Precio histórico conservado (actual {fmtMoney(i.precio_actual)})</small></div>}
                        </td>
                        <td className="num"><input className="qty-input" type="number" inputMode="decimal" min="0" step={i.permite_decimales ? '0.1' : '1'}
                          value={i.cantidad} onChange={(e) => cambiarCantidad(i.producto_id, e.target.value)} /></td>
                        <td>{i.unidad}</td>
                        <td className="num">{fmtMoney(i.precio)}</td>
                        <td className="num strong">{fmtMoney((Number(i.cantidad) || 0) * i.precio)}</td>
                        <td><button type="button" className="icon-btn danger" onClick={() => quitar(i.producto_id)} aria-label="Quitar"><Trash2 size={17} /></button></td>
                      </tr>
                    ))}
                    {!form.items.length && <tr><td colSpan={6} className="center muted">Aún no hay productos en el pedido.</td></tr>}
                  </tbody>
                </table>
              </div>
              {errors.items && <p className="err">{errors.items}</p>}
            </div>
          </div>

          <div className="card order-total">
            <h2>Resumen</h2>
            <p className="muted" style={{ margin: '6px 0 2px' }}>
              {form.items.length} producto(s) en el pedido
            </p>
            <div className="big-total">{fmtMoney(total)}</div>
            <Field label="Observaciones" className="mt">
              <textarea rows={3} maxLength={500} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} placeholder="Ej.: entregar en portería" />
            </Field>
            <button className="btn btn-primary btn-lg mt" style={{ width: '100%' }} disabled={saving} onClick={() => guardar(false)}>
              <Save size={18} /> {saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar pedido'}
            </button>
            {editando && <button className="btn mt" style={{ width: '100%' }} onClick={() => nav('/pedidos')}>Cancelar edición</button>}
          </div>
        </div>
      </fieldset>

      {nuevoApto && (
        <NuevoAptoModal unidad={cat.unidades.find((u) => u.id === Number(form.unidad_id))} onClose={() => setNuevoApto(false)}
          onSaved={async (a) => { await cat.reload(); setForm((f) => ({ ...f, apartamento_id: a.id, cliente_id: '' })); setNuevoApto(false); }} />
      )}
    </>
  );
}

function NuevoAptoModal({ unidad, onClose, onSaved }) {
  const toast = useToast();
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [saving, setSaving] = useState(false);
  async function guardar() {
    setSaving(true);
    try {
      let apto;
      if (nombre || telefono) {
        const c = await api.post('/clientes', { unidad_id: unidad.id, apartamento: numero, nombre, telefono });
        apto = { id: c.apartamento_id };
      } else {
        apto = await api.post('/apartamentos', { unidad_id: unidad.id, numero });
      }
      toast.success('Apartamento registrado.');
      onSaved(apto);
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  }
  return (
    <Modal title={`Nuevo apartamento en ${unidad?.nombre}`} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving} onClick={guardar}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Número de apartamento" hint="Déjelo vacío para 'Sin especificar'"><input value={numero} maxLength={20} onChange={(e) => setNumero(e.target.value)} autoFocus /></Field>
        <Field label="Comprador (opcional)"><input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} /></Field>
        <Field label="Teléfono (opcional)"><input value={telefono} maxLength={30} onChange={(e) => setTelefono(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
