import { cx } from '@pe/shared/ui';
import { Bell, BookOpen, CalendarCheck, House, School, UserRound, Wallet, type LucideIcon } from 'lucide-react';

export type Tab = 'home' | 'fees' | 'attendance' | 'homework' | 'school';

const ITEMS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'home', label: 'Accueil', icon: House },
  { tab: 'fees', label: 'Frais', icon: Wallet },
  { tab: 'attendance', label: 'Présences', icon: CalendarCheck },
  { tab: 'homework', label: 'Devoirs', icon: BookOpen },
  { tab: 'school', label: 'École', icon: School },
];

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav aria-label="Navigation principale" className="grid grid-cols-5 border-t border-line bg-surface px-1.5 pt-1.5 pb-safe-2 lg:hidden">
      {ITEMS.map(({ tab: t, label, icon: Icon }) => {
        const current = t === tab;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-current={current ? 'page' : undefined}
            className={cx('flex flex-col items-center gap-0.5 py-1.5 text-xs', current ? 'font-bold text-brand' : 'font-semibold text-ink-3')}
          >
            <span className={cx('flex h-[30px] w-14 items-center justify-center rounded-full transition-colors', current && 'bg-brand-soft')}>
              <Icon size={22} strokeWidth={current ? 2.1 : 1.9} aria-hidden="true" />
            </span>
            {label}
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
  unread,
  onNotifications,
  onAccount,
  current,
}: {
  tab: Tab | null;
  onChange: (t: Tab) => void;
  unread: number;
  onNotifications: () => void;
  onAccount: () => void;
  current: 'notifications' | 'account' | null;
}) {
  const item = (active: boolean) =>
    cx(
      'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] transition-colors',
      active ? 'bg-brand-soft font-bold text-brand' : 'font-semibold text-ink-2 hover:bg-ground',
    );
  return (
    <nav aria-label="Navigation principale" className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-chalk text-ink">
          <School size={22} aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">ParentEcole</span>
      </div>
      <ul className="flex flex-col gap-1">
        {ITEMS.map(({ tab: t, label, icon: Icon }) => (
          <li key={t}>
            <button type="button" onClick={() => onChange(t)} aria-current={t === tab ? 'page' : undefined} className={item(t === tab)}>
              <Icon size={21} strokeWidth={t === tab ? 2.1 : 1.9} aria-hidden="true" />
              {label}
            </button>
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
        <li>
          <button type="button" onClick={onNotifications} aria-current={current === 'notifications' ? 'page' : undefined} className={item(current === 'notifications')}>
            <Bell size={21} aria-hidden="true" />
            <span className="flex-1 text-left">Nouveautés</span>
            {unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
        </li>
        <li>
          <button type="button" onClick={onAccount} aria-current={current === 'account' ? 'page' : undefined} className={item(current === 'account')}>
            <UserRound size={21} aria-hidden="true" />
            Mon compte
          </button>
        </li>
      </ul>
    </nav>
  );
}
