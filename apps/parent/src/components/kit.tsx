import { parseISODate } from '@pe/shared';
import { cx } from '@pe/shared/ui';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// Briques d'interface de l'app parent, version épurée : icônes fines grises, listes à filets,
// la couleur réservée aux états (absent, retard, paiement urgent).

/** Ancienne palette de tuiles : seul « c » (alerte) garde une couleur. */
export type Tone = 'g' | 'a' | 'b' | 'c' | 't' | 'v';

/** Icône de début de ligne (sans fond coloré). */
export function Tile({ icon, tone, size = 24, className }: { icon: IconName; tone?: Tone; size?: number; className?: string }) {
  return (
    <span
      className={cx('flex shrink-0 items-center justify-center', tone === 'c' ? 'text-danger' : !className?.includes('text-') && 'text-ink-3', className)}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={size >= 40 ? Math.round(size * 0.6) : 20} />
    </span>
  );
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' | 'ul' }) {
  return <As className={cx('pe-card', className)}>{children}</As>;
}

/** Rangée de liste : icône, deux lignes de texte, élément de fin, flèche si elle mène quelque part. */
export function Row({
  left,
  title,
  sub,
  end,
  onClick,
  chevron,
  className,
}: {
  left?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {left}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] leading-snug font-medium">{title}</span>
        {sub && <span className="mt-px text-[13px] leading-snug text-ink-3">{sub}</span>}
      </span>
      {end && <span className="shrink-0 text-right">{end}</span>}
      {(chevron ?? !!onClick) && <Icon name="caret-right" size={18} className="text-ink-4" />}
    </>
  );
  const cls = cx('flex w-full items-center gap-3.5 py-3 pr-5 text-left', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, 'active:opacity-70')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Liste de rangées séparées par un filet fin. `grouped` : bloc blanc arrondi, pour les écrans
 * de réglages sur fond gris.
 */
export function List({ children, className, grouped }: { children: ReactNode; className?: string; grouped?: boolean }) {
  return (
    <div
      className={cx(
        '[&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-line-soft',
        grouped ? 'mx-4 overflow-hidden rounded-[14px] bg-surface pl-4' : 'pl-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({ title, action, onAction, count, small }: { title: string; action?: string; onAction?: () => void; count?: number; small?: boolean }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', small ? 'mx-8 mt-5 mb-1.5' : 'mx-5 mt-7 mb-1')}>
      <h2 className={small ? 'text-[13px] font-semibold text-ink-3' : 'text-[17px] font-semibold'}>
        {title}
        {count ? <span className="ml-1.5 font-medium text-ink-4">{count}</span> : null}
      </h2>
      {action && (
        <button type="button" onClick={onAction} className="min-h-9 text-sm font-semibold text-brand">
          {action}
        </button>
      )}
    </div>
  );
}

export type PillTone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

const pillTone: Record<PillTone, string> = {
  ok: 'font-semibold text-ok',
  warn: 'font-semibold text-warn',
  bad: 'font-semibold text-danger',
  info: 'font-semibold text-info',
  mute: 'text-ink-3',
};

/** État en texte coloré (sans pastille de fond). */
export function Pill({ tone = 'mute', icon, children, className }: { tone?: PillTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[13px] whitespace-nowrap', pillTone[tone], className)}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </span>
  );
}

/** Filtres défilants (une seule valeur active). */
export function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; count?: number }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx('scrollbar-none flex gap-2 overflow-x-auto px-5 pt-3 pb-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px]',
            o.value === value ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line font-medium text-ink-2',
          )}
        >
          {o.label}
          {o.count ? <span className="text-xs font-semibold opacity-75">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Onglets soulignés (Notes · Devoirs · Présences · Horaire). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="scrollbar-none flex gap-6 overflow-x-auto border-b border-line px-5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('-mb-px shrink-0 border-b-2 py-2.5 text-[15px]', o.value === value ? 'border-brand font-semibold text-ink' : 'border-transparent font-medium text-ink-3')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-line')}
    >
      <span className={cx('absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

/** Date en vignette : jour et mois. Rouge pour un jour férié. */
export function DateBox({ date, tone }: { date: string; tone?: 'bad' | 'ok' | 'info' | 'warn' }) {
  const d = parseISODate(date);
  return (
    <span className="w-12 shrink-0 rounded-[10px] border border-line py-1.5 text-center">
      <span className={cx('block text-xl leading-tight font-semibold tabular-nums', tone === 'bad' && 'text-danger')}>{d.getDate()}</span>
      <span className="block text-xs text-ink-3">{new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d)}</span>
    </span>
  );
}

export function Note({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <p className="mx-5 mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-ink-3">
      <Icon name={icon} size={16} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

/** État vide : une illustration (bibliothèque unDraw) ou une icône, un titre, une phrase. */
export function EmptyState({ icon, image, title, children, action }: { icon?: IconName; image?: string; tone?: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 pt-8 pb-4 text-center">
      {image ? <img src={image} alt="" className="mb-2 h-32 w-auto" /> : icon && <Icon name={icon} size={30} className="text-ink-4" />}
      <h3 className="mt-3 mb-1 text-base font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-sm leading-relaxed text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Pastille rouge de compteur. */
export function CountBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cx('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white', className)}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

/** Couleur d'un pourcentage : rouge seulement sous la moyenne, sinon couleur du texte. */
export const percentColor = (p: number) => (p < 50 ? 'text-danger' : '');

/** Bouton plein largeur ou compact. */
export function Btn({
  children,
  icon,
  onClick,
  variant = 'primary',
  size = 'md',
  block,
  disabled,
  loading,
  type = 'button',
  className,
}: {
  children: ReactNode;
  icon?: IconName;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const v = {
    primary: 'bg-brand text-white',
    ghost: 'border border-field bg-surface text-ink',
    soft: 'bg-muted text-ink',
    danger: 'bg-danger-soft text-danger-ink',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-opacity active:opacity-80 disabled:opacity-60',
        size === 'md' ? 'h-12 rounded-xl px-[18px] text-[15px]' : 'h-9 rounded-[10px] px-3.5 text-sm',
        block && 'w-full',
        v,
        className,
      )}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon && <Icon name={icon} size={size === 'md' ? 19 : 16} />}
      {children}
    </button>
  );
}
