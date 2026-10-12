import { addDays, formatLongCap, relativeDays, todayISO, type Homework } from '@pe/shared';
import { errorMessage, markHomeworkSeen, unmarkHomeworkSeen } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { Btn, Chips, EmptyState, Note, Pill, Section, Tile } from '../components/kit';
import type { Child } from '../data';
import { subjectStyle } from '../helpers';
import doneImg from '../assets/illustrations/tout-est-fait.svg';

type Filter = 'todo' | 'seen' | 'all';

export function HomeworkView({ child: c }: { child: Child }) {
  const [filter, setFilter] = useState<Filter>('todo');
  const today = todayISO();
  const recent = c.homework.filter((h) => h.dueDate >= addDays(today, -30));
  const todo = recent.filter((h) => h.dueDate >= today && !c.seen.has(h.id));
  const list =
    filter === 'todo'
      ? todo
      : filter === 'seen'
        ? recent.filter((h) => c.seen.has(h.id)).reverse()
        : [...recent].sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  const groups = new Map<string, Homework[]>();
  for (const h of list) groups.set(h.dueDate, [...(groups.get(h.dueDate) ?? []), h]);
  const label = (date: string) => {
    const r = relativeDays(date, today);
    return r === 'demain' || r === "aujourd'hui" ? `${r === 'demain' ? 'Demain' : "Aujourd'hui"} · ${formatLongCap(date)}` : formatLongCap(date);
  };

  return (
    <>
      <Chips
        label="Devoirs"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'todo', label: 'À faire', count: todo.length },
          { value: 'seen', label: 'Vus' },
          { value: 'all', label: 'Tous' },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon="notebook" image={filter === 'todo' ? doneImg : undefined} title={filter === 'todo' ? 'Aucun devoir à faire' : 'Aucun devoir'}>
          {filter === 'todo' ? "Tout est vu pour l'instant. Vous serez prévenu dès qu'un enseignant en ajoute." : 'Les devoirs des 30 derniers jours apparaissent ici.'}
        </EmptyState>
      ) : (
        [...groups.entries()].map(([date, items]) => (
          <div key={date}>
            <Section title={label(date)} />
            <div className="flex flex-col gap-3">
              {items.map((h) => (
                <HomeworkCard key={h.id} h={h} child={c} past={h.dueDate < today} />
              ))}
            </div>
          </div>
        ))
      )}
      {filter === 'todo' && todo.length > 0 && <Note icon="signature">« Marquer comme vu » prévient l'enseignant, comme la signature du journal de classe.</Note>}
    </>
  );
}

function HomeworkCard({ h, child, past }: { h: Homework; child: Child; past: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const seen = child.seen.has(h.id);
  const [busy, setBusy] = useState(false);
  const st = subjectStyle(h.subject);

  async function toggle() {
    const { db } = getFirebase();
    setBusy(true);
    try {
      if (seen) await unmarkHomeworkSeen(db, child.id, h.id);
      else
        await markHomeworkSeen(db, {
          homeworkId: h.id,
          studentId: child.id,
          schoolId: child.student.schoolId,
          classId: child.student.classId,
          uid: user!.uid,
        });
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
          <div className="text-xs font-semibold text-ink-3">
            {h.subject} · {h.teacherName}
          </div>
          <h3 className="text-[15px] leading-snug font-semibold">{h.title}</h3>
          {h.description && <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{h.description}</p>}
        </div>
      </div>
      <div className="my-3 h-px bg-line-soft" />
      {seen ? (
        <div className="flex items-center justify-between gap-2">
          <Pill tone="ok" icon="check-circle">
            Vu par vous
          </Pill>
          {!past && (
            <button type="button" onClick={() => void toggle()} disabled={busy} className="text-[12.5px] font-semibold text-ink-3">
              Annuler
            </button>
          )}
        </div>
      ) : past ? (
        <Pill>À rendre le {formatLongCap(h.dueDate)}</Pill>
      ) : (
        <Btn size="sm" variant="soft" block icon="signature" loading={busy} onClick={() => void toggle()}>
          Marquer comme vu (signer le journal)
        </Btn>
      )}
    </article>
  );
}
