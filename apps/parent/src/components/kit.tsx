import { parseISODate } from '@pe/shared';
import { cx } from '@pe/shared/ui';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// Briques d'interface de l'app parent, d'après la maquette validée (cartes, tuiles colorées,
// rangées, pastilles, puces, interrupteurs).

export type Tone = 'g' | 'a' | 'b' | 'c' | 't' | 'v';

export function Tile({ icon, tone, size = 42, className }: { icon: IconName; tone: Tone; size?: number; className?: string }) {
  return (
    <span className={cx(`tone-${tone} flex shrink-0 items-center justify-center`, className)} style={{ width: size, height: size, borderRadius: size * 0.33 }}>
      <Icon name={icon} size={Math.round(size * 0.54)} />
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
        <span className="text-[15px] leading-snug font-bold">{title}</span>
        {sub && <span className="mt-px text-[13px] leading-snug text-ink-3">{sub}</span>}
      </span>
      {end && <span className="shrink-0 text-right">{end}</span>}
      {(chevron ?? !!onClick) && <Icon name="caret-right" size={18} className="text-ink-3" />}
    </>
  );
  const cls = cx('flex w-full items-center gap-3 px-4 py-3 text-left', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, 'active:bg-muted/60')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Liste de rangées dans une carte (séparateurs entre les rangées). */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('pe-card mx-4 overflow-hidden [&>*+*]:border-t [&>*+*]:border-line-soft', className)}>{children}</div>;
}

export function Section({ title, action, onAction, count }: { title: string; action?: string; onAction?: () => void; count?: number }) {
  return (
    <div className="mx-5 mt-6 mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[17.5px] font-extrabold">
        {title}
        {count ? <span className="ml-2 align-middle text-[13px] font-bold text-ink-3">{count}</span> : null}
      </h2>
      {action && (
        <button type="button" onClick={onAction} className="min-h-9 text-[13px] font-bold text-brand">
          {action}
        </button>
      )}
    </div>
  );
}

export type PillTone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

const pillTone: Record<PillTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info',
  mute: 'bg-muted text-ink-3',
};

export function Pill({ tone = 'mute', icon, children, className }: { tone?: PillTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px] font-bold whitespace-nowrap', pillTone[tone], className)}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/** Puces de filtre défilantes (une seule active). */
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
    <div role="group" aria-label={label} className={cx('scrollbar-none flex gap-2 overflow-x-auto px-4 pt-0.5 pb-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold',
            o.value === value ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-2',
          )}
        >
          {o.label}
          {o.count ? <span className="text-[11px] font-extrabold opacity-80">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Onglets segmentés (Notes · Devoirs · Présences · Horaire). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mx-4 mt-0.5 mb-1.5 flex gap-0.5 rounded-[15px] bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('h-9 flex-1 rounded-[11px] text-[13px]', o.value === value ? 'bg-surface font-extrabold text-ink shadow-sm' : 'font-semibold text-ink-3')}
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
      className={cx('relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-[var(--ok)]' : 'bg-line')}
    >
      <span className={cx('absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

/** Pavé de date (mois, jour, jour de la semaine). */
export function DateBox({ date, tone = 'bad' }: { date: string; tone?: 'bad' | 'ok' | 'info' | 'warn' }) {
  const d = parseISODate(date);
  const head = { bad: 'bg-danger', ok: 'bg-[var(--ok)]', info: 'bg-info', warn: 'bg-chalk text-ink' }[tone];
  return (
    <span className="w-[54px] shrink-0 overflow-hidden rounded-[15px] border border-line bg-surface text-center">
      <span className={cx('block py-0.5 text-[11px] font-extrabold tracking-wider text-white uppercase', head)}>
        {new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d).replace('.', '')}
      </span>
      <span className="block font-display text-[22px] leading-tight font-extrabold">{d.getDate()}</span>
      <span className="block pb-0.5 text-[10.5px] font-semibold text-ink-3">{new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d).replace('.', '')}</span>
    </span>
  );
}

export function Note({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <p className="mx-5 mt-3.5 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-3">
      <Icon name={icon} size={18} className="mt-px" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ icon, tone = 'a', title, children, action }: { icon: IconName; tone?: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 pt-7 pb-3 text-center">
      <Tile icon={icon} tone={tone} size={52} />
      <h3 className="mt-3 mb-1 font-display text-lg font-bold">{title}</h3>
      {children && <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Pastille rouge de compteur. */
export function CountBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cx('inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-ground bg-danger px-1 text-[11px] font-extrabold text-white', className)}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

/** Couleur d'un pourcentage : vert au-dessus de 70 %, ambre au-dessus de 50 %, rouge en dessous. */
export const percentColor = (p: number) => (p >= 70 ? 'text-ok' : p >= 50 ? 'text-warn' : 'text-danger');

/** Bouton plein largeur ou compact, aux couleurs de la maquette. */
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
    ghost: 'border border-line bg-surface text-ink',
    soft: 'bg-brand-soft text-brand',
    danger: 'bg-danger-soft text-danger-ink',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-extrabold transition-transform active:scale-[.985] disabled:opacity-60',
        size === 'md' ? 'h-12 rounded-[15px] px-[18px] text-[14.5px]' : 'h-9 rounded-xl px-3 text-[13px]',
        block && 'w-full',
        v,
        className,
      )}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon && <Icon name={icon} size={size === 'md' ? 20 : 17} />}
      {children}
    </button>
  );
}
