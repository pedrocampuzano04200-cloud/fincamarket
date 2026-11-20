// Ruta: frontend/src/pages/Unidades.jsx
// Unidades residenciales, apartamentos y compradores (clientes).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Building2, ClipboardList } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Empty, Badge, Modal, Field, useAsync, useToast } from '../components/ui';
import { UnidadSelect } from '../components/selectors';
import { fmtMoney, aptoLabel } from '../utils';

export default function Unidades() {
  const [tab, setTab] = useState('aptos');
  return (
    <>
      <PageHeader title="Unidades y apartamentos" subtitle="Lugares y personas que realizan pedidos." />
      <div className="tabs">
        <button className={tab === 'aptos' ? 'active' : ''} onClick={() => setTab('aptos')}>Unidades y apartamentos</button>
        <button className={tab === 'clientes' ? 'active' : ''} onClick={() => setTab('clientes')}>Compradores / clientes</button>
      </div>
      {tab === 'aptos' ? <UnidadesAptos /> : <Clientes />}
    </>
  );
}

function UnidadesAptos() {
  const toast = useToast();
  const unidades = useAsync(() => api.get('/unidades'), []);
  const [sel, setSel] = useState(null);
  const [buscar, setBuscar] = useState('');
  const unidadId = sel ?? unidades.data?.[0]?.id;
  const aptos = useAsync(() => (unidadId ? api.get('/apartamentos', { unidad_id: unidadId, numero: buscar }) : Promise.resolve([])), [unidadId, buscar]);
  const [editU, setEditU] = useState(null);
  const [editA, setEditA] = useState(null);
  const unidad = unidades.data?.find((u) => u.id === unidadId);

  async function guardarUnidad() {
    try {
      const body = { nombre: editU.nombre, direccion: editU.direccion, observaciones: editU.observaciones, activo: editU.activo === undefined ? undefined : Boolean(editU.activo) };
      const r = editU.id ? await api.put(`/unidades/${editU.id}`, body) : await api.post('/unidades', body);
      toast.success('Unidad guardada.'); setEditU(null); await unidades.reload(); setSel(r.id); aptos.reload();
    } catch (e) { toast.error(e); }
  }
  async function guardarApto() {
    try {
      const body = { unidad_id: unidadId, numero: editA.numero, observaciones: editA.observaciones, activo: editA.activo === undefined ? undefined : Boolean(editA.activo) };
      if (editA.id) await api.put(`/apartamentos/${editA.id}`, body); else await api.post('/apartamentos', body);
      toast.success('Apartamento guardado.'); setEditA(null); aptos.reload(); unidades.reload();
    } catch (e) { toast.error(e); }
  }

  return (
    <div className="grid grid-side">
      <div className="card">
        <div className="card-head"><h2>Unidades</h2><button className="btn btn-sm btn-primary" onClick={() => setEditU({ nombre: '', direccion: '', observaciones: '' })}><Plus size={15} /> Nueva</button></div>
        <ErrorBox error={unidades.error} />
        {unidades.loading && !unidades.data ? <Loader /> : (
          <div className="list-select">
            {(unidades.data || []).map((u) => (
              <button key={u.id} className={u.id === unidadId ? 'active' : ''} onClick={() => setSel(u.id)}>
                <span><Building2 size={15} /> {u.nombre}{!u.activo && <small className="muted"> (inactiva)</small>}</span>
                <small className="muted">{u.apartamentos} aptos</small>
              </button>
            ))}
            {!unidades.data?.length && <Empty>Registre la primera unidad residencial.</Empty>}
          </div>
        )}
      </div>
      <div className="card">
        {unidad ? (
          <>
            <div className="card-head">
              <div><h2>{unidad.nombre}</h2><small className="muted">{unidad.direccion || 'Sin dirección'} · {unidad.clientes} compradores</small></div>
              <div className="row">
                <input placeholder="Buscar apartamento…" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ width: 190 }} />
                <button className="btn btn-sm" onClick={() => setEditU(unidad)}><Pencil size={15} /> Editar unidad</button>
                <button className="btn btn-sm btn-primary" onClick={() => setEditA({ numero: '', observaciones: '' })}><Plus size={15} /> Apartamento</button>
              </div>
            </div>
            {aptos.loading && !aptos.data ? <Loader /> : aptos.data?.length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>Apartamento</th><th className="num">Pedidos</th><th className="num">Total comprado</th><th className="num">Saldo pendiente</th><th>Estado</th><th /></tr></thead>
                <tbody>{aptos.data.map((a) => (
                  <tr key={a.id} className={a.activo ? '' : 'inactive'}>
                    <td className="strong">{aptoLabel(a.numero)}{a.observaciones && <><br /><small className="muted">{a.observaciones}</small></>}</td>
                    <td className="num">{a.pedidos}</td><td className="num">{fmtMoney(a.total_comprado)}</td>
                    <td className={`num ${a.saldo_pendiente > 0 ? 'err strong' : ''}`}>{fmtMoney(a.saldo_pendiente)}</td>
                    <td><Badge value={a.activo ? 'ACTIVO' : 'INACTIVO'} color={a.activo ? 'green' : 'gray'} /></td>
                    <td><div className="actions">
                      <Link className="icon-btn" title="Historial de compras" to={`/historial?tab=apartamento&apartamento_id=${a.id}`}><ClipboardList size={17} /></Link>
                      <button className="icon-btn" title="Editar" onClick={() => setEditA(a)}><Pencil size={17} /></button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <Empty>No hay apartamentos.</Empty>}
          </>
        ) : <Empty>Seleccione o cree una unidad residencial.</Empty>}
      </div>

      {editU && (
        <Modal title={editU.id ? 'Editar unidad' : 'Nueva unidad residencial'} size="sm" onClose={() => setEditU(null)}
          footer={<><button className="btn" onClick={() => setEditU(null)}>Cancelar</button><button className="btn btn-primary" disabled={!editU.nombre?.trim()} onClick={guardarUnidad}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Nombre *" className="span-2"><input autoFocus value={editU.nombre} maxLength={120} onChange={(e) => setEditU({ ...editU, nombre: e.target.value })} placeholder="Ej.: Unidad Los Pinos" /></Field>
            <Field label="Dirección" className="span-2"><input value={editU.direccion || ''} maxLength={200} onChange={(e) => setEditU({ ...editU, direccion: e.target.value })} /></Field>
            <Field label="Observaciones" className="span-2"><textarea rows={2} value={editU.observaciones || ''} onChange={(e) => setEditU({ ...editU, observaciones: e.target.value })} /></Field>
            {editU.id && <label className="check"><input type="checkbox" checked={!!editU.activo} onChange={(e) => setEditU({ ...editU, activo: e.target.checked ? 1 : 0 })} /> Activa</label>}
          </div>
          {!editU.id && <p className="muted"><small>Se crea automáticamente el registro "Sin especificar" para pedidos sin número de apartamento.</small></p>}
        </Modal>
      )}
      {editA && (
        <Modal title={editA.id ? 'Editar apartamento' : `Nuevo apartamento en ${unidad.nombre}`} size="sm" onClose={() => setEditA(null)}
          footer={<><button className="btn" onClick={() => setEditA(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarApto}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Número" hint="Vacío = Sin especificar"><input autoFocus value={editA.numero || ''} maxLength={20} onChange={(e) => setEditA({ ...editA, numero: e.target.value })} /></Field>
            <Field label="Observaciones"><input value={editA.observaciones || ''} onChange={(e) => setEditA({ ...editA, observaciones: e.target.value })} /></Field>
            {editA.id && <label className="check"><input type="checkbox" checked={!!editA.activo} onChange={(e) => setEditA({ ...editA, activo: e.target.checked ? 1 : 0 })} /> Activo</label>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Clientes() {
  const toast = useToast();
  const unidades = useAsync(() => api.get('/unidades'), []);
  const [f, setF] = useState({ unidad_id: '', apartamento: '', q: '' });
  const { data, loading, error, reload } = useAsync(() => api.get('/clientes', f), [JSON.stringify(f)]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState({});
  async function guardar() {
    const e = {};
    if (!edit.unidad_id) e.unidad_id = 'Seleccione la unidad';
    if (edit.telefono && !/^[0-9+()\-\s]{7,30}$/.test(edit.telefono)) e.telefono = 'Teléfono inválido';
    setErr(e); if (Object.keys(e).length) return;
    try {
      const body = { unidad_id: edit.unidad_id, apartamento: edit.apartamento, nombre: edit.nombre, telefono: edit.telefono, observaciones: edit.observaciones };
      if (edit.id) await api.put(`/clientes/${edit.id}`, body); else await api.post('/clientes', body);
      toast.success('Comprador guardado.'); setEdit(null); reload();
    } catch (ex) { toast.error(ex); }
  }
  return (
    <>
      <div className="card mb">
        <div className="filters">
          <label className="field"><span>Unidad residencial</span><UnidadSelect unidades={unidades.data || []} value={f.unidad_id} onChange={(v) => setF({ ...f, unidad_id: v })} /></label>
          <label className="field"><span>N.º apartamento</span><input value={f.apartamento} onChange={(e) => setF({ ...f, apartamento: e.target.value })} /></label>
          <label className="field"><span>Nombre o teléfono</span><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <button className="btn btn-primary" onClick={() => { setErr({}); setEdit({ unidad_id: f.unidad_id || '', apartamento: '', nombre: '', telefono: '', observaciones: '' }); }}><Plus size={16} /> Nuevo comprador</button>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="card">
        {loading && !data ? <Loader /> : data?.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Unidad</th><th>Apartamento</th><th>Comprador</th><th>Teléfono</th><th className="num">Pedidos</th><th>Observaciones</th><th /></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.id}><td>{c.unidad}</td><td>{aptoLabel(c.apartamento)}</td><td className="strong">{c.nombre || <span className="muted">Sin nombre</span>}</td>
                <td>{c.telefono}</td><td className="num">{c.pedidos}</td><td><small>{c.observaciones}</small></td>
                <td><div className="actions">
                  <Link className="icon-btn" title="Pedidos" to={`/historial?tab=apartamento&apartamento_id=${c.apartamento_id}`}><ClipboardList size={17} /></Link>
                  <button className="icon-btn" onClick={() => { setErr({}); setEdit({ ...c, apartamento: c.apartamento || '' }); }}><Pencil size={17} /></button>
                </div></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>No hay compradores registrados con esos filtros.</Empty>}
      </div>
      {edit && (
        <Modal title={edit.id ? 'Editar comprador' : 'Nuevo comprador'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Unidad residencial *" error={err.unidad_id}><UnidadSelect unidades={(unidades.data || []).filter((u) => u.activo)} todas="Seleccione…" value={edit.unidad_id} onChange={(v) => setEdit({ ...edit, unidad_id: v })} /></Field>
            <Field label="N.º apartamento" hint="Opcional. Si no existe, se crea."><input value={edit.apartamento} maxLength={20} onChange={(e) => setEdit({ ...edit, apartamento: e.target.value })} /></Field>
            <Field label="Nombre del comprador"><input value={edit.nombre || ''} maxLength={120} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
            <Field label="Teléfono" error={err.telefono}><input value={edit.telefono || ''} maxLength={30} inputMode="tel" onChange={(e) => setEdit({ ...edit, telefono: e.target.value })} /></Field>
            <Field label="Observaciones" className="span-2"><textarea rows={2} value={edit.observaciones || ''} onChange={(e) => setEdit({ ...edit, observaciones: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
