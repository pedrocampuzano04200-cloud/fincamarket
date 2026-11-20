// Ruta: frontend/src/components/ui.jsx
// Componentes de interfaz reutilizables: notificaciones, confirmaciones, modales, insignias, etc.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, TriangleAlert, Check, Info } from 'lucide-react';
import { capital } from '../utils';

/* ------------------------------ Notificaciones ------------------------------ */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, message) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  const api = useRef({
    success: (m) => push('success', m), error: (m) => push('error', m?.message || m), info: (m) => push('info', m),
  }).current;
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts no-print" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? <Check size={18} /> : t.type === 'error' ? <TriangleAlert size={18} /> : <Info size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ------------------------------ Confirmaciones ------------------------------ */
const ConfirmCtx = createContext(null);
/**
 * const confirm = useConfirm();
 * const ok = await confirm({ title, message, danger, input: { label, required, minLength } })
 * Devuelve false si se cancela; true o el texto ingresado si se confirma.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const confirm = useCallback((opts) => new Promise((resolve) => { setText(''); setState({ ...opts, resolve }); }), []);
  const close = (v) => { state.resolve(v); setState(null); };
  const inp = state?.input;
  const invalid = inp && inp.required && text.trim().length < (inp.minLength || 1);
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title || 'Confirmar'} onClose={() => close(false)} size="sm">
          <p className="confirm-msg">{state.message}</p>
          {inp && (
            <label className="field">
              <span>{inp.label}</span>
              <textarea rows={3} value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder={inp.placeholder} />
              {invalid && text && <small className="err">Mínimo {inp.minLength || 1} caracteres</small>}
            </label>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => close(false)}>Cancelar</button>
            <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} disabled={invalid}
              onClick={() => close(inp ? text.trim() : true)}>{state.confirmText || 'Confirmar'}</button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------------------------------- Modal ---------------------------------- */
let openModals = 0;
export function Modal({ title, children, onClose, size = 'md', footer }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    openModals += 1; document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', h);
      openModals -= 1; if (openModals <= 0) document.body.classList.remove('modal-open');
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn no-print" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- Varios --------------------------------- */
const BADGE = {
  PENDIENTE: 'amber', CONFIRMADO: 'blue', ENTREGADO: 'green', CANCELADO: 'red',
  CERRADO: 'green', REABIERTO: 'gray', PAGADO: 'green', PARCIAL: 'amber',
};
export const Badge = ({ value, color }) => <span className={`badge badge-${color || BADGE[value] || 'gray'}`}>{capital(value)}</span>;

export const Loader = ({ text = 'Cargando…' }) => <div className="loader"><span className="spinner" />{text}</div>;
export const Empty = ({ children = 'No hay datos para mostrar.' }) => <div className="empty">{children}</div>;

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error">
      <TriangleAlert size={18} /> <span>{error.message || String(error)}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      <div className="page-actions no-print">{children}</div>
    </div>
  );
}

export function Field({ label, error, children, hint, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span>{label}</span>}
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

export function Kpi({ label, value, icon: Icon, tone = 'green', hint }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-icon">{Icon && <Icon size={20} />}</div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {hint && <div className="kpi-hint">{hint}</div>}
      </div>
    </div>
  );
}

/** Hook para cargar datos asíncronos con estado de carga y error. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (my === seq.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (my === seq.current) setState((s) => ({ ...s, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: d })) };
}
