// Ruta: frontend/src/pages/Configuracion.jsx
// Datos de la finca, copias de seguridad y restauración.
import { useEffect, useState } from 'react';
import { Database, Download, RotateCcw, Save } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, ErrorBox, Empty, Field, useAsync, useToast, useConfirm } from '../components/ui';
import { fmtDateTime } from '../utils';

export default function Configuracion() {
  const toast = useToast();
  const confirm = useConfirm();
  const cfg = useAsync(() => api.get('/configuracion'), []);
  const backups = useAsync(() => api.get('/backups'), []);
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cfg.data) setV(cfg.data); }, [cfg.data]);

  async function guardar() {
    if (!v.nombre_finca?.trim()) { toast.error('El nombre de la finca es obligatorio.'); return; }
    try { await api.put('/configuracion', v); toast.success('Configuración guardada.'); } catch (e) { toast.error(e); }
  }
  async function respaldar() {
    setBusy(true);
    try { const r = await api.post('/backups'); toast.success(`Copia creada: ${r.nombre}`); backups.reload(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  async function restaurar(b) {
    const txt = await confirm({
      title: 'Restaurar copia de seguridad', danger: true, confirmText: 'Restaurar',
      message: `Se reemplazarán TODOS los datos actuales por los de "${b.nombre}". Antes se creará automáticamente una copia del estado actual. Escriba RESTAURAR para confirmar.`,
      input: { label: 'Confirmación', required: true, minLength: 9, placeholder: 'RESTAURAR' },
    });
    if (!txt) return;
    if (txt !== 'RESTAURAR') { toast.error('Debe escribir RESTAURAR exactamente.'); return; }
    setBusy(true);
    try {
      const r = await api.post(`/backups/${b.nombre}/restaurar`, { confirmacion: 'RESTAURAR' });
      toast.success(`Base de datos restaurada. Copia previa: ${r.respaldo_previo}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos generales y copias de seguridad." />
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Datos de la finca</h2></div>
          <ErrorBox error={cfg.error} />
          {!v ? <Loader /> : (
            <div className="form-grid">
              <Field label="Nombre de la finca *" className="span-2"><input value={v.nombre_finca || ''} maxLength={120} onChange={(e) => setV({ ...v, nombre_finca: e.target.value })} /></Field>
              <Field label="NIT / Documento"><input value={v.nit_finca || ''} onChange={(e) => setV({ ...v, nit_finca: e.target.value })} /></Field>
              <Field label="Teléfono"><input value={v.telefono_finca || ''} onChange={(e) => setV({ ...v, telefono_finca: e.target.value })} /></Field>
              <Field label="Mensaje en cuentas de cobro" className="span-2" hint="Ej.: medios de pago (Nequi 300…)"><textarea rows={3} maxLength={500} value={v.mensaje_cuenta_cobro || ''} onChange={(e) => setV({ ...v, mensaje_cuenta_cobro: e.target.value })} /></Field>
              <div><button className="btn btn-primary" onClick={guardar}><Save size={16} /> Guardar</button></div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <div><h2>Copias de seguridad</h2><small className="muted">{backups.data?.carpeta}</small></div>
            <button className="btn btn-primary" disabled={busy} onClick={respaldar}><Database size={16} /> {busy ? 'Procesando…' : 'Crear copia ahora'}</button>
          </div>
          <p className="muted"><small>Se recomienda crear una copia después de cada cierre semanal y guardarla también en una memoria USB o en otra carpeta.</small></p>
          <ErrorBox error={backups.error} />
          {backups.loading && !backups.data ? <Loader /> : backups.data?.archivos.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Archivo</th><th>Fecha</th><th className="num">Tamaño</th><th /></tr></thead>
              <tbody>{backups.data.archivos.map((b) => (
                <tr key={b.nombre}><td><small>{b.nombre}</small></td><td className="nowrap"><small>{fmtDateTime(b.fecha)}</small></td><td className="num">{(b.tamano / 1024).toFixed(0)} KB</td>
                  <td><div className="actions">
                    <a className="icon-btn" title="Descargar" href={api.url(`/backups/${b.nombre}`)}><Download size={17} /></a>
                    <button className="icon-btn danger" title="Restaurar" disabled={busy} onClick={() => restaurar(b)}><RotateCcw size={17} /></button>
                  </div></td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Aún no hay copias de seguridad.</Empty>}
        </div>
      </div>
    </>
  );
}
