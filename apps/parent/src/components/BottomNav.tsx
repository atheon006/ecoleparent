import { cx } from '@pe/shared/ui';
import type { Tab } from '../nav';
import { Icon, type IconName } from './Icon';
import { CountBadge } from './kit';

const ITEMS: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'home', label: 'Accueil', icon: 'house' },
  { tab: 'school', label: 'Scolarité', icon: 'graduation-cap' },
  { tab: 'news', label: 'Annonces', icon: 'megaphone' },
  { tab: 'fees', label: 'Frais', icon: 'wallet' },
  { tab: 'more', label: 'Plus', icon: 'squares-four' },
];

export type Badges = Partial<Record<Tab, number>>;

export function BottomNav({ tab, onChange, badges }: { tab: Tab; onChange: (t: Tab) => void; badges: Badges }) {
  return (
    <nav aria-label="Navigation principale" className="grid grid-cols-5 border-t border-line bg-surface px-1.5 pt-[7px] pb-safe-3 lg:hidden">
      {ITEMS.map(({ tab: t, label, icon }) => {
        const current = t === tab;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-current={current ? 'page' : undefined}
            className={cx('relative flex flex-col items-center gap-[3px] text-[11px]', current ? 'font-extrabold text-brand' : 'font-semibold text-ink-3')}
          >
            <span
              className={cx('flex h-8 w-14 items-center justify-center rounded-2xl transition-colors', current && 'bg-brand-soft')}
              style={current ? ({ '--duo': 'var(--color-chalk)', '--duo-op': 1 } as React.CSSProperties) : undefined}
            >
              <Icon name={icon} size={24} />
            </span>
            {label}
            <CountBadge n={badges[t] ?? 0} className="absolute top-0 right-[calc(50%-26px)]" />
          </button>
        );
      })}
    </nav>
  );
}

/** Navigation latérale sur grand écran (ordinateur) : remplace la barre du bas. */
export function SideNav({
  tab,
  onChange,
  badges,
  unread,
  onNotifications,
  notificationsOpen,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  badges: Badges;
  unread: number;
  onNotifications: () => void;
  notificationsOpen: boolean;
}) {
  const item = (active: boolean) =>
    cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] transition-colors', active ? 'bg-brand-soft font-bold text-brand' : 'font-semibold text-ink-2 hover:bg-ground');
  return (
    <nav aria-label="Navigation principale" className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-chalk text-ink">
          <Icon name="student" size={24} />
        </span>
        <span className="font-display text-xl font-bold">ParentEcole</span>
      </div>
      <ul className="flex flex-col gap-1">
        {ITEMS.map(({ tab: t, label, icon }) => (
          <li key={t}>
            <button type="button" onClick={() => onChange(t)} aria-current={t === tab && !notificationsOpen ? 'page' : undefined} className={item(t === tab && !notificationsOpen)}>
              <Icon name={icon} size={22} />
              <span className="flex-1 text-left">{label}</span>
              <CountBadge n={badges[t] ?? 0} />
            </button>
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
        <li>
          <button type="button" onClick={onNotifications} aria-current={notificationsOpen ? 'page' : undefined} className={item(notificationsOpen)}>
            <Icon name="bell" size={22} />
            <span className="flex-1 text-left">Nouveautés</span>
            <CountBadge n={unread} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
