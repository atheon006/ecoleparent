import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Boutons ────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'chalk';
type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-3 disabled:bg-brand/60',
  secondary: 'bg-surface text-ink border border-field hover:bg-muted',
  ghost: 'bg-transparent text-brand hover:bg-muted',
  danger: 'bg-danger text-white hover:bg-danger-ink',
  chalk: 'bg-chalk text-ink hover:brightness-95',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'min-h-11 px-4 text-[15px] rounded-[10px] gap-2',
  lg: 'min-h-12 px-5 text-base rounded-xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-semibold transition-colors select-none',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-muted', className)}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Champs de formulaire ───────────────────────────────────────────────────

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  id: string;
  children: ReactNode;
  className?: string;
}

function FieldShell({ label, hint, error, id, children, className }: FieldShellProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-[13px] font-semibold text-danger-ink">{error}</span>
      ) : hint ? (
        <span className="text-[13px] leading-snug text-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full rounded-[10px] border border-field bg-surface px-3.5 text-[16px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-muted';

type FieldBase = { label: string; hint?: ReactNode; error?: string | null; wrapperClassName?: string };

export function Field({ label, hint, error, wrapperClassName, className, id, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <input id={fid} {...rest} className={cx(inputClass, 'h-12', className)} aria-invalid={!!error || undefined} />
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, wrapperClassName, className, id, children, ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <select id={fid} {...rest} className={cx(inputClass, 'h-12 pr-8', className)}>
        {children}
      </select>
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, wrapperClassName, className, id, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <textarea id={fid} rows={4} {...rest} className={cx(inputClass, 'py-3 leading-relaxed', className)} />
    </FieldShell>
  );
}

export function Checkbox({ label, hint, className, ...rest }: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-start gap-3 py-1', className)}>
      <input type="checkbox" {...rest} className="mt-0.5 size-5 shrink-0 accent-brand" />
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        {hint && <span className="text-[13px] text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

// ── Affichage ──────────────────────────────────────────────────────────────

type Tone = 'brand' | 'danger' | 'warn' | 'info' | 'neutral' | 'solid';

const tones: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  danger: 'bg-danger-soft text-danger-ink',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-ink-2',
  solid: 'bg-brand text-white',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <As className={cx('rounded-[14px] border border-line bg-surface', className)}>{children}</As>;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[14px] border border-line px-6 py-10 text-center">
      {icon && <div className="flex size-10 items-center justify-center text-ink-3">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="max-w-sm text-[14px] leading-relaxed text-ink-3">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-[10px] border border-danger-line bg-danger-soft px-3.5 py-3 text-[14px] font-medium leading-snug text-danger-text">
      {children}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-3" role="status">
      <Spinner />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

/** Barre de progression décorative (le texte à côté porte l'information). */
export function Progress({ value, track = 'bg-brand-soft', bar = 'bg-brand', className }: { value: number; track?: string; bar?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div aria-hidden="true" className={cx('h-2 overflow-hidden rounded-full', track, className)}>
      <div className={cx('h-full rounded-full transition-[width]', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Contrôle segmenté (onglets compacts). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx('grid gap-1 rounded-xl bg-muted p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex min-h-10 items-center justify-center gap-2 rounded-[9px] px-2 text-[14px] transition',
            o.value === value ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(17_22_19/8%)]' : 'font-medium text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Fenêtres ───────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  sheet,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Feuille ancrée en bas sur mobile. */
  sheet?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose change à chaque rendu chez l'appelant : on le lit via une référence
  // pour que l'effet ne s'exécute qu'à l'ouverture (sinon le focus saute à chaque frappe).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={cx('fixed inset-0 z-50 flex justify-center bg-ink/45 print:static print:bg-transparent', sheet ? 'items-end sm:items-center' : 'items-end sm:items-center sm:p-4')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[20px] bg-surface shadow-xl sm:rounded-2xl print:max-h-none print:shadow-none',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3 print:hidden">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton label="Fermer" onClick={onClose} data-close>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3 print:hidden">{footer}</div>}
      </div>
    </div>
  );
}

// ── Notifications éphémères ────────────────────────────────────────────────

interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

const ToastContext = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-3 text-[14px] font-medium shadow-lg',
              t.tone === 'ok' ? 'bg-[#1b211e] text-white' : 'bg-danger text-white',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Initiales pour les avatars : « David Kasereka » → « DK ». */
export function initials(first: string, last = ''): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase();
}
