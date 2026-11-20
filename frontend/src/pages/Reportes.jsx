// Ruta: frontend/src/pages/Reportes.jsx
// Generación de reportes en PDF y Excel.
import { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Loader, Empty, Badge, useAsync } from '../components/ui';
import { useCatalogos, UnidadSelect, AptoSelect, ProductoSelect } from '../components/selectors';
import { fmtMoney, fmtDate, monthRange, weekRange, addDays } from '../utils';

export default function Reportes() {
  const cat = useCatalogos();
  const [f, setF] = useState({ ...monthRange(), unidad_id: '', apartamento_id: '', producto_id: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v, ...(k === 'unidad_id' ? { apartamento_id: '' } : {}) }));
  const cierres = useAsync(() => api.get('/cierres'), []);
  const resumen = useAsync(() => api.get('/historial/productos', f), [JSON.stringify(f)]);
  const total = (resumen.data || []).reduce((s, p) => s + p.total, 0);

  return (
    <>
      <PageHeader title="Reportes" subtitle="Exporte la información a PDF o Excel." />
      <div className="card mb">
        <div className="card-head"><div><h2>Reporte de ventas</h2><small className="muted">Incluye ventas por semana, por producto, por apartamento, saldos pendientes y el detalle de pedidos.</small></div></div>
        <div className="row mb">
          <button className="chip" onClick={() => setF({ ...f, ...weekRange() })}>Esta semana</button>
          <button className="chip" onClick={() => setF({ ...f, ...weekRange(addDays(weekRange().desde, -1)) })}>Semana anterior</button>
          <button className="chip" onClick={() => setF({ ...f, ...monthRange() })}>Este mes</button>
          <button className="chip" onClick={() => setF({ ...f, ...monthRange(addDays(monthRange().desde, -1)) })}>Mes anterior</button>
          <button className="chip" onClick={() => setF({ ...f, desde: '', hasta: '' })}>Todo el historial</button>
        </div>
        <div className="filters">
          <label className="field"><span>Desde</span><input type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} /></label>
          <label className="field"><span>Hasta</span><input type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} /></label>
          <label className="field"><span>Unidad</span><UnidadSelect unidades={cat.unidades} value={f.unidad_id} onChange={(v) => set('unidad_id', v)} /></label>
          <label className="field"><span>Apartamento</span><AptoSelect apartamentos={cat.apartamentos} unidadId={f.unidad_id} value={f.apartamento_id} onChange={(v) => set('apartamento_id', v)} /></label>
          <label className="field"><span>Producto</span><ProductoSelect productos={cat.productos} value={f.producto_id} onChange={(v) => set('producto_id', v)} /></label>
        </div>
        <div className="row mt">
          <span className="muted">Total vendido en el filtro: <b>{resumen.loading ? '…' : fmtMoney(total)}</b> ({(resumen.data || []).length} productos)</span>
          <span className="spacer" />
          <a className="btn" href={api.url('/reportes/ventas.pdf', f)} target="_blank" rel="noreferrer"><FileDown size={16} /> Descargar PDF</a>
          <a className="btn btn-primary" href={api.url('/reportes/ventas.xlsx', f)}><FileSpreadsheet size={16} /> Descargar Excel</a>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Liquidaciones semanales</h2><small className="muted">Consolidado y cuentas de cobro de cada cierre.</small></div></div>
        {cierres.loading && !cierres.data ? <Loader /> : cierres.data?.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Código</th><th>Período</th><th>Estado</th><th className="num">Total</th><th /></tr></thead>
            <tbody>{cierres.data.map((c) => (
              <tr key={c.id}><td className="strong">{c.codigo}</td><td>{fmtDate(c.fecha_inicio)} – {fmtDate(c.fecha_fin)}</td><td><Badge value={c.estado} /></td><td className="num">{fmtMoney(c.total_general)}</td>
                <td><div className="actions">
                  <a className="btn btn-sm" href={api.url(`/cierres/${c.id}/pdf`)} target="_blank" rel="noreferrer"><FileDown size={15} /> PDF</a>
                  <a className="btn btn-sm" href={api.url(`/cierres/${c.id}/excel`)}><FileSpreadsheet size={15} /> Excel</a>
                </div></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Aún no hay cierres.</Empty>}
      </div>
    </>
  );
}
