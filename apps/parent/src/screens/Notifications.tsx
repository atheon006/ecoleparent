import { formatShort, formatTime } from '@pe/shared';
import { Empty, IconButton, cx } from '@pe/shared/ui';
import { ArrowLeft, Award, Bell, BookOpen, Clock, Megaphone, Wallet, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Nav } from '../App';
import { useParentData, type FeedKind } from '../data';

const KIND: Record<FeedKind, { icon: typeof Bell; box: string }> = {
  absence: { icon: X, box: 'bg-danger text-white' },
  late: { icon: Clock, box: 'bg-chalk text-ink' },
  payment: { icon: Wallet, box: 'bg-brand text-white' },
  conduct: { icon: Award, box: 'bg-warn-soft text-warn' },
  homework: { icon: BookOpen, box: 'bg-info-soft text-info' },
  announcement: { icon: Megaphone, box: 'bg-brand-soft text-brand' },
};

export function Notifications({ nav }: { nav: Nav }) {
  const { feed, markFeedRead, setActiveId, seenAt } = useParentData();
  // On garde la date de dernière lecture d'avant l'ouverture pour surligner les nouveautés.
  const [readBefore] = useState(seenAt);
  useEffect(() => markFeedRead(), [markFeedRead]);

  return (
    <div className="flex h-full flex-col bg-ground">
      <header className="flex items-center gap-2 px-3 pt-safe-3 pb-2">
        <IconButton label="Retour" onClick={nav.close}>
          <ArrowLeft size={24} aria-hidden="true" />
        </IconButton>
        <h1 className="font-display text-2xl font-bold">Nouveautés</h1>
      </header>
      <main className="flex-1 overflow-y-auto px-5 pb-8">
        {feed.length === 0 ? (
          <Empty icon={<Bell size={22} />} title="Rien de nouveau">
            Absences, paiements, devoirs et communiqués des 30 derniers jours apparaîtront ici.
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {feed.map((f) => {
              const k = KIND[f.kind];
              const Icon = k.icon;
              const fresh = f.at > readBefore;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (f.childId) setActiveId(f.childId);
                      nav.go(f.kind === 'payment' ? 'fees' : f.kind === 'homework' ? 'homework' : f.kind === 'absence' || f.kind === 'late' ? 'attendance' : 'school');
                    }}
                    className={cx('flex w-full gap-3 rounded-2xl border p-3.5 text-left', fresh ? 'border-brand/40 bg-surface' : 'border-line bg-surface/70')}
                  >
                    <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', k.box)}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[15px] font-bold">{f.title}</span>
                        {fresh && <span className="size-2 shrink-0 rounded-full bg-danger" aria-label="Nouveau" />}
                      </span>
                      <span className="line-clamp-2 text-[13px] text-ink-2">{f.body}</span>
                      <span className="text-xs text-ink-3">
                        {formatShort(f.at.slice(0, 10))} · {formatTime(f.at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
