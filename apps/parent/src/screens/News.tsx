import { formatShort, type Announcement, type AnnouncementCategory } from '@pe/shared';
import { acknowledgeAnnouncement, errorMessage } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { RootHeader } from '../components/ChildPicker';
import type { IconName } from '../components/Icon';
import { Btn, Chips, EmptyState, Pill, Tile, type Tone } from '../components/kit';
import { useParentData, type Child } from '../data';
import type { Nav } from '../nav';

const STYLE: Record<AnnouncementCategory, { icon: IconName; tone: Tone }> = {
  Général: { icon: 'megaphone', tone: 'a' },
  Urgent: { icon: 'warning-circle', tone: 'c' },
  Pédagogique: { icon: 'chalkboard-teacher', tone: 'b' },
  Financier: { icon: 'wallet', tone: 'a' },
  Congés: { icon: 'calendar-x', tone: 't' },
};

type Filter = 'all' | 'confirm';

export function NewsScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  const [filter, setFilter] = useState<Filter>('all');
  if (!active) return null;
  const toConfirm = active.announcements.filter((a) => a.important && !active.acks.has(a.id));
  const list = filter === 'confirm' ? toConfirm : active.announcements;
  return (
    <div>
      <RootHeader title="Annonces" subtitle={active.school?.name} nav={nav} />
      <Chips
        label="Annonces"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Toutes' },
          { value: 'confirm', label: 'À confirmer', count: toConfirm.length },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon="megaphone" title={filter === 'confirm' ? 'Rien à confirmer' : 'Aucune annonce'}>
          {filter === 'confirm' ? 'Vous avez confirmé la lecture de tous les communiqués importants.' : "Les communiqués de la direction apparaîtront ici."}
        </EmptyState>
      ) : (
        <div className="mt-1.5 flex flex-col gap-3">
          {list.map((a) => (
            <AnnouncementCard key={a.id} a={a} child={active} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ a, child }: { a: Announcement; child: Child }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const st = STYLE[a.category] ?? STYLE.Général;
  const confirmed = child.acks.has(a.id);

  async function confirm() {
    setBusy(true);
    try {
      await acknowledgeAnnouncement(getFirebase().db, child.student.schoolId, a.id, { uid: user!.uid, name: user!.displayName || user!.email || 'Parent' });
      toast('Lecture confirmée. Merci !');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="pe-card mx-4 p-4">
      <div className="flex items-start gap-3">
        <Tile icon={st.icon} tone={st.tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] leading-snug font-semibold">{a.title}</h2>
            <span className="shrink-0 text-[11.5px] text-ink-3">{formatShort(a.publishedAt.slice(0, 10))}</span>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{a.content}</p>
          <p className="mt-1.5 text-xs text-ink-3">
            {a.category} · {a.author}
          </p>
        </div>
      </div>
      {a.important && (
        <>
          <div className="my-3 h-px bg-line-soft" />
          {confirmed ? (
            <Pill tone="ok" icon="check-circle">
              Lecture confirmée
            </Pill>
          ) : (
            <Btn size="sm" variant="soft" icon="check" loading={busy} onClick={() => void confirm()}>
              Confirmer la lecture
            </Btn>
          )}
        </>
      )}
    </article>
  );
}
