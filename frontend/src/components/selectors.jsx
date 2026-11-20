// Ruta: frontend/src/components/selectors.jsx
// Catálogos compartidos y selectores de unidad / apartamento / producto.
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { aptoLabel } from '../utils';

/** Carga unidades, apartamentos y productos (para filtros y formularios). */
export function useCatalogos({ productos = true } = {}) {
  const [cat, setCat] = useState({ unidades: [], apartamentos: [], productos: [], loading: true });
  const load = useCallback(async () => {
    const [unidades, apartamentos, prods] = await Promise.all([
      api.get('/unidades'), api.get('/apartamentos'), productos ? api.get('/productos') : Promise.resolve([]),
    ]);
    setCat({ unidades, apartamentos, productos: prods, loading: false });
  }, [productos]);
  useEffect(() => { load().catch(() => setCat((c) => ({ ...c, loading: false }))); }, [load]);
  return { ...cat, reload: load };
}

export function UnidadSelect({ unidades, value, onChange, todas = 'Todas las unidades', ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} {...rest}>
      <option value="">{todas}</option>
      {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}{u.activo ? '' : ' (inactiva)'}</option>)}
    </select>
  );
}

export function AptoSelect({ apartamentos, unidadId, value, onChange, todas = 'Todos los apartamentos', ...rest }) {
  const list = apartamentos.filter((a) => !unidadId || a.unidad_id === Number(unidadId));
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} {...rest}>
      <option value="">{todas}</option>
      {list.map((a) => <option key={a.id} value={a.id}>{unidadId ? '' : `${a.unidad} · `}{aptoLabel(a.numero)}</option>)}
    </select>
  );
}

export function ProductoSelect({ productos, value, onChange, todas = 'Todos los productos', ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} {...rest}>
      <option value="">{todas}</option>
      {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
}
