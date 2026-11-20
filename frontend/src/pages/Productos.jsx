// Ruta: frontend/src/pages/Productos.jsx
// Administración de productos, categorías y unidades de medida.
import { useState } from 'react';
import { Plus, Pencil, Power, DollarSign, Trash2 } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Empty, Badge, Modal, Field, useAsync, useToast, useConfirm } from '../components/ui';
import { fmtMoney, fmtDateTime } from '../utils';

export default function Productos() {
  const [tab, setTab] = useState('productos');
  return (
    <>
      <PageHeader title="Productos" subtitle="Catálogo de productos de la finca, precios y unidades de medida." />
      <div className="tabs">
        <button className={tab === 'productos' ? 'active' : ''} onClick={() => setTab('productos')}>Productos</button>
        <button className={tab === 'categorias' ? 'active' : ''} onClick={() => setTab('categorias')}>Categorías</button>
        <button className={tab === 'um' ? 'active' : ''} onClick={() => setTab('um')}>Unidades de medida</button>
      </div>
      {tab === 'productos' && <ListaProductos />}
      {tab === 'categorias' && <Catalogo tipo="categorias" />}
      {tab === 'um' && <Catalogo tipo="unidades-medida" />}
    </>
  );
}

function ListaProductos() {
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState({ q: '', categoria_id: '', activo: 'todos' });
  const { data, loading, error, reload } = useAsync(() => api.get('/productos', f), [JSON.stringify(f)]);
  const cats = useAsync(() => api.get('/categorias'), []);
  const ums = useAsync(() => api.get('/unidades-medida'), []);
  const [edit, setEdit] = useState(null);
  const [precio, setPrecio] = useState(null);

  async function toggle(p) {
    const ok = await confirm({
      title: p.activo ? 'Desactivar producto' : 'Activar producto', danger: !!p.activo,
      message: p.activo ? `"${p.nombre}" dejará de aparecer al registrar pedidos. Los pedidos históricos se conservan.` : `"${p.nombre}" volverá a estar disponible para pedidos.`,
    });
    if (!ok) return;
    try { await api.patch(`/productos/${p.id}/estado`, { activo: !p.activo }); toast.success('Estado actualizado.'); reload(); } catch (e) { toast.error(e); }
  }
  async function eliminar(p) {
    if (!(await confirm({ title: 'Eliminar producto', danger: true, confirmText: 'Eliminar', message: `¿Eliminar definitivamente "${p.nombre}"? Solo es posible si nunca se ha usado en un pedido.` }))) return;
    try { await api.del(`/productos/${p.id}`); toast.success('Producto eliminado.'); reload(); } catch (e) { toast.error(e); }
  }

  return (
    <>
      <div className="card mb">
        <div className="filters">
          <label className="field"><span>Buscar por nombre</span><input value={f.q} placeholder="Ej.: tomate" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <label className="field"><span>Categoría</span>
            <select value={f.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value })}>
              <option value="">Todas</option>{(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="field"><span>Estado</span>
            <select value={f.activo} onChange={(e) => setF({ ...f, activo: e.target.value })}>
              <option value="todos">Todos</option><option value="1">Activos</option><option value="0">Inactivos</option>
            </select>
          </label>
          <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} /> Nuevo producto</button>
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="card">
        {loading && !data ? <Loader /> : data?.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Producto</th><th>Categoría</th><th>Unidad</th><th className="num">Precio</th><th>Estado</th><th className="num">Usos</th><th>Creado</th><th /></tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id} className={p.activo ? '' : 'inactive'}>
                <td><span className="strong">{p.nombre}</span>{p.descripcion && <><br /><small className="muted">{p.descripcion}</small></>}</td>
                <td>{p.categoria}</td><td>{p.unidad_medida}</td>
                <td className="num strong">{fmtMoney(p.precio)}</td>
                <td><Badge value={p.activo ? 'ACTIVO' : 'INACTIVO'} color={p.activo ? 'green' : 'gray'} /></td>
                <td className="num">{p.veces_pedido}</td>
                <td className="nowrap"><small>{fmtDateTime(p.created_at)}</small></td>
                <td><div className="actions">
                  <button className="icon-btn" title="Cambiar precio" onClick={() => setPrecio(p)}><DollarSign size={17} /></button>
                  <button className="icon-btn" title="Editar" onClick={() => setEdit(p)}><Pencil size={17} /></button>
                  <button className="icon-btn" title={p.activo ? 'Desactivar' : 'Activar'} onClick={() => toggle(p)}><Power size={17} /></button>
                  {!p.veces_pedido && <button className="icon-btn danger" title="Eliminar" onClick={() => eliminar(p)}><Trash2 size={17} /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>No se encontraron productos.</Empty>}
      </div>
      {edit && <ProductoForm producto={edit} cats={cats.data || []} ums={ums.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {precio && <PrecioForm producto={precio} onClose={() => setPrecio(null)} onSaved={() => { setPrecio(null); reload(); }} />}
    </>
  );
}

function ProductoForm({ producto, cats, ums, onClose, onSaved }) {
  const toast = useToast();
  const nuevo = !producto.id;
  const [v, setV] = useState({
    nombre: producto.nombre || '', categoria_id: producto.categoria_id || '', unidad_medida_id: producto.unidad_medida_id || '',
    descripcion: producto.descripcion || '', precio: producto.precio ?? '', activo: producto.activo ?? 1,
  });
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  async function guardar() {
    const e = {};
    if (!v.nombre.trim()) e.nombre = 'El nombre es obligatorio';
    if (!v.categoria_id) e.categoria_id = 'Seleccione una categoría';
    if (!v.unidad_medida_id) e.unidad_medida_id = 'Seleccione la unidad de medida';
    if (v.precio === '' || Number(v.precio) < 0 || Number.isNaN(Number(v.precio))) e.precio = 'Ingrese un precio válido (0 o mayor)';
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = { ...v, precio: Number(v.precio), activo: Boolean(v.activo) };
    try {
      if (nuevo) await api.post('/productos', body); else await api.put(`/productos/${producto.id}`, body);
      toast.success(nuevo ? 'Producto creado.' : 'Producto actualizado.');
      onSaved();
    } catch (ex) { toast.error(ex); if (ex.code === 'DUPLICADO') setErr({ nombre: ex.message }); } finally { setSaving(false); }
  }
  return (
    <Modal title={nuevo ? 'Nuevo producto' : `Editar ${producto.nombre}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving} onClick={guardar}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Nombre *" error={err.nombre} className="span-2"><input value={v.nombre} maxLength={100} autoFocus onChange={(e) => set('nombre', e.target.value)} /></Field>
        <Field label="Categoría *" error={err.categoria_id}>
          <select value={v.categoria_id} onChange={(e) => set('categoria_id', e.target.value)}><option value="">Seleccione…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </Field>
        <Field label="Unidad de medida *" error={err.unidad_medida_id}>
          <select value={v.unidad_medida_id} onChange={(e) => set('unidad_medida_id', e.target.value)}><option value="">Seleccione…</option>{ums.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}</select>
        </Field>
        <Field label="Precio de venta *" error={err.precio} hint={!nuevo ? 'Los pedidos anteriores conservan su precio' : ''}>
          <input type="number" min="0" step="50" inputMode="numeric" value={v.precio} onChange={(e) => set('precio', e.target.value)} />
        </Field>
        <Field label="Estado"><select value={v.activo ? 1 : 0} onChange={(e) => set('activo', Number(e.target.value))}><option value={1}>Activo</option><option value={0}>Inactivo</option></select></Field>
        <Field label="Descripción" className="span-2"><textarea rows={2} maxLength={500} value={v.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function PrecioForm({ producto, onClose, onSaved }) {
  const toast = useToast();
  const [precio, setPrecio] = useState(producto.precio);
  const hist = useAsync(() => api.get(`/productos/${producto.id}`), [producto.id]);
  async function guardar() {
    if (precio === '' || Number(precio) < 0) { toast.error('Precio inválido'); return; }
    try { await api.patch(`/productos/${producto.id}/precio`, { precio: Number(precio) }); toast.success('Precio actualizado.'); onSaved(); } catch (e) { toast.error(e); }
  }
  return (
    <Modal title={`Precio de ${producto.nombre}`} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={guardar}>Actualizar precio</button></>}>
      <Field label={`Nuevo precio por ${producto.unidad_medida.toLowerCase()}`} hint={`Precio actual: ${fmtMoney(producto.precio)}. Los pedidos ya registrados no cambian.`}>
        <input type="number" min="0" step="50" autoFocus value={precio} onChange={(e) => setPrecio(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} />
      </Field>
      {hist.data?.historial_precios?.length > 0 && (
        <><h4 className="mt">Historial de precios</h4>
          <table><tbody>{hist.data.historial_precios.map((h, i) => (
            <tr key={i}><td><small>{fmtDateTime(h.fecha)}</small></td><td className="num">{fmtMoney(h.precio_anterior)} → <b>{fmtMoney(h.precio_nuevo)}</b></td></tr>
          ))}</tbody></table></>
      )}
    </Modal>
  );
}

/** Mantenimiento simple de categorías y unidades de medida. */
function Catalogo({ tipo }) {
  const toast = useToast();
  const confirm = useConfirm();
  const esUM = tipo === 'unidades-medida';
  const { data, loading, error, reload } = useAsync(() => api.get(`/${tipo}`), [tipo]);
  const [edit, setEdit] = useState(null);
  async function guardar() {
    try {
      const body = esUM ? { nombre: edit.nombre, abreviatura: edit.abreviatura, permite_decimales: !!edit.permite_decimales } : { nombre: edit.nombre, descripcion: edit.descripcion };
      if (edit.id) await api.put(`/${tipo}/${edit.id}`, body); else await api.post(`/${tipo}`, body);
      toast.success('Guardado.'); setEdit(null); reload();
    } catch (e) { toast.error(e); }
  }
  async function eliminar(c) {
    if (!(await confirm({ title: 'Eliminar categoría', danger: true, message: `¿Eliminar "${c.nombre}"? Solo es posible si no tiene productos.` }))) return;
    try { await api.del(`/categorias/${c.id}`); toast.success('Eliminada.'); reload(); } catch (e) { toast.error(e); }
  }
  return (
    <div className="card">
      <div className="card-head"><h2>{esUM ? 'Unidades de medida' : 'Categorías'}</h2>
        <button className="btn btn-primary" onClick={() => setEdit({ nombre: '', abreviatura: '', descripcion: '', permite_decimales: 0 })}><Plus size={16} /> Agregar</button></div>
      <ErrorBox error={error} />
      {loading && !data ? <Loader /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Nombre</th>{esUM ? <><th>Abreviatura</th><th>Admite decimales</th></> : <><th>Descripción</th><th className="num">Productos</th></>}<th /></tr></thead>
          <tbody>{(data || []).map((c) => (
            <tr key={c.id}><td className="strong">{c.nombre}</td>
              {esUM ? <><td>{c.abreviatura}</td><td>{c.permite_decimales ? 'Sí (ej. 1,5 kg)' : 'No (solo enteros)'}</td></> : <><td>{c.descripcion}</td><td className="num">{c.productos}</td></>}
              <td><div className="actions">
                <button className="icon-btn" onClick={() => setEdit(c)}><Pencil size={17} /></button>
                {!esUM && !c.productos && <button className="icon-btn danger" onClick={() => eliminar(c)}><Trash2 size={17} /></button>}
              </div></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Editar' : 'Agregar'} size="sm" onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" disabled={!edit.nombre?.trim() || (esUM && !edit.abreviatura?.trim())} onClick={guardar}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Nombre *"><input autoFocus value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
            {esUM ? (<>
              <Field label="Abreviatura *"><input value={edit.abreviatura} maxLength={10} onChange={(e) => setEdit({ ...edit, abreviatura: e.target.value })} /></Field>
              <label className="check"><input type="checkbox" checked={!!edit.permite_decimales} onChange={(e) => setEdit({ ...edit, permite_decimales: e.target.checked ? 1 : 0 })} /> Admite cantidades con decimales</label>
            </>) : <Field label="Descripción"><input value={edit.descripcion || ''} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} /></Field>}
          </div>
        </Modal>
      )}
    </div>
  );
}
