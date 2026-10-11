import { formatShort, formatTime } from '@pe/shared';
import { cx } from '@pe/shared/ui';
import { useEffect, useState } from 'react';
import { SubHeader } from '../components/ChildPicker';
import type { IconName } from '../components/Icon';
import { EmptyState, Note, Tile, type Tone } from '../components/kit';
import { useParentData, type FeedItem, type FeedKind } from '../data';
import type { Nav } from '../nav';

const KIND: Record<FeedKind, { icon: IconName; tone: Tone }> = {
  absence: { icon: 'warning-circle', tone: 'c' },
  late: { icon: 'clock', tone: 'a' },
  payment: { icon: 'receipt', tone: 'b' },
  conduct: { icon: 'star', tone: 'a' },
  homework: { icon: 'notebook', tone: 'v' },
  announcement: { icon: 'megaphone', tone: 'a' },
  grade: { icon: 'chart-line-up', tone: 'g' },
  bulletin: { icon: 'certificate', tone: 'g' },
  permission: { icon: 'signature', tone: 't' },
  appointment: { icon: 'handshake', tone: 'g' },
  request: { icon: 'folder-simple', tone: 'b' },
};

function dayGroup(at: string): string {
  const d = at.slice(0, 10);
  const today = new Date();
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d === iso(today)) return "Aujourd'hui";
  if (d === iso(yesterday)) return 'Hier';
  return formatShort(d);
}

export function Notifications({ nav }: { nav: Nav }) {
  const { feed, markFeedRead, setActiveId, seenAt } = useParentData();
  // On garde la date de dernière lecture d'avant l'ouverture pour surligner les nouveautés.
  const [readBefore] = useState(seenAt);
  useEffect(() => markFeedRead(), [markFeedRead]);

  function open(f: FeedItem) {
    if (f.childId) setActiveId(f.childId);
    switch (f.kind) {
      case 'payment':
        return nav.go('fees');
      case 'homework':
        return nav.go('school', 'devoirs');
      case 'absence':
      case 'late':
        return nav.go('school', 'presences');
      case 'grade':
        return nav.go('school', 'notes');
      case 'bulletin':
        return nav.push({ name: 'bulletins' });
      case 'announcement':
        return nav.go('news');
      case 'conduct':
        return nav.push({ name: 'conduct' });
      case 'permission':
        return nav.push({ name: 'permissions' });
      case 'appointment':
        return nav.push({ name: 'meetings' });
      case 'request':
        return nav.push({ name: 'child' });
    }
  }

  const groups = [...new Set(feed.map((f) => dayGroup(f.at)))];
  return (
    <div>
      <SubHeader title="Nouveautés" subtitle="30 derniers jours" onBack={nav.back} />
      {feed.length === 0 ? (
        <EmptyState icon="bell" title="Rien de nouveau">
          Absences, notes, paiements, devoirs et communiqués apparaîtront ici.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g}>
            <h2 className="mx-5 mt-5 mb-2 font-display text-[15px] font-extrabold text-ink-2">{g}</h2>
            <div className="pe-card mx-4 overflow-hidden [&>*+*]:border-t [&>*+*]:border-line-soft">
              {feed
                .filter((f) => dayGroup(f.at) === g)
                .map((f) => {
                  const fresh = f.at > readBefore;
                  return (
                    <button key={f.id} type="button" onClick={() => open(f)} className={cx('flex w-full items-start gap-3 px-4 py-3 text-left', fresh && 'bg-brand-soft/40')}>
                      <Tile icon={KIND[f.kind].icon} tone={KIND[f.kind].tone} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-snug font-bold">{f.title}</span>
                        <span className="line-clamp-2 block text-[13px] text-ink-3">{f.body}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11.5px] text-ink-3">{formatTime(f.at)}</span>
                        {fresh && <span className="size-2.5 rounded-full bg-danger" aria-label="Nouveau" />}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))
      )}
      <Note icon="gear-six">Choisissez ce que vous recevez dans Plus › Paramètres › Notifications.</Note>
    </div>
  );
}
