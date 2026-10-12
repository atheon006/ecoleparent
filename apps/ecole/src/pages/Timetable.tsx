import { WEEKDAY_LABELS, type Timetable, type TimetableSlot, type Weekday } from '@pe/shared';
import { q, saveTimetable } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Button, Card, Empty, ErrorNote, Field, Modal, SelectField } from '@pe/shared/ui';
import { CalendarClock, Copy, Plus, ScanText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAccess, useRole } from '../access';
import { PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';
import { ClassPicker } from './Grades';

const byStart = (a: TimetableSlot, b: TimetableSlot) => a.day - b.day || a.start.localeCompare(b.start);

export function TimetablePage() {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { schoolId, classes, myClasses, school } = useSchool();
  const visible = role === 'admin' ? classes : myClasses.length ? myClasses : classes;
  const [classId, setClassId] = useState(visible[0]?.id ?? '');
  const [editing, setEditing] = useState<{ index: number | null; slot: TimetableSlot } | null>(null);
  const [copying, setCopying] = useState(false);
  const { busy, run } = useAction();
  const all = useLiveQuery<Timetable>(`timetables:${schoolId}`, () => q.timetables(db, schoolId));
  const current = all.data.find((t) => t.classId === classId);
  const slots = [...(current?.slots ?? [])].sort(byStart);
  const days: Weekday[] = school?.saturdayClasses ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const isAdmin = role === 'admin';
  const cls = classes.find((c) => c.id === classId);

  const save = (next: TimetableSlot[], message: string) =>
    run(async () => {
      await saveTimetable(db, { schoolId, classId, slots: next, updatedBy: access.email });
      return true;
    }, message);

  if (!visible.length) {
    return (
      <div>
        <PageHeader title="Horaire" />
        <Empty icon={<CalendarClock size={22} />} title="Aucune classe" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Horaire"
        description="L'horaire de la semaine de chaque classe, visible par les parents (cours du jour sur l'accueil de l'application)."
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" icon={<ScanText size={16} aria-hidden="true" />} onClick={() => (window.location.hash = '/importer?type=timetable')}>
                Depuis une photo
              </Button>
              <Button variant="secondary" icon={<Copy size={16} aria-hidden="true" />} onClick={() => setCopying(true)} disabled={all.data.filter((t) => t.classId !== classId && t.slots.length).length === 0}>
                Copier d'une classe
              </Button>
              <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing({ index: null, slot: { day: 1, start: '07:30', end: '08:20', subject: '' } })}>
                Ajouter un cours
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 sm:max-w-sm">
        <ClassPicker classes={visible} value={classId} onChange={setClassId} />
      </div>
      {slots.length === 0 ? (
        <Empty icon={<CalendarClock size={22} />} title="Horaire pas encore saisi">
          {isAdmin ? 'Ajoutez les cours de chaque jour, avec l’heure de début et de fin.' : 'La direction ne l’a pas encore saisi.'}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {days.map((d) => {
            const list = slots.filter((s) => s.day === d);
            return (
              <Card key={d} className="flex flex-col gap-2 p-3">
                <span className="px-1 text-base font-semibold">{WEEKDAY_LABELS[d]}</span>
                {list.length === 0 ? (
                  <span className="px-1 text-sm text-ink-3">Pas de cours</span>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {list.map((s) => {
                      const index = slots.indexOf(s);
                      const body = (
                        <>
                          <span className="text-xs font-semibold text-ink-3">
                            {s.start} – {s.end}
                          </span>
                          <span className="font-semibold">{s.subject}</span>
                          {(s.teacher || s.room) && <span className="text-xs text-ink-2">{[s.teacher, s.room].filter(Boolean).join(' · ')}</span>}
                        </>
                      );
                      return (
                        <li key={`${s.start}-${index}`}>
                          {isAdmin ? (
                            <button type="button" onClick={() => setEditing({ index, slot: s })} className="flex w-full flex-col rounded-xl bg-ground px-3 py-2 text-left hover:bg-brand-soft">
                              {body}
                            </button>
                          ) : (
                            <div className="flex flex-col rounded-xl bg-ground px-3 py-2">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {busy && <p className="mt-3 text-sm text-ink-3">Enregistrement…</p>}
      {editing && (
        <SlotForm
          slot={editing.slot}
          days={days}
          subjects={(cls?.subjects ?? []).map((s) => s.name)}
          existing={editing.index !== null}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            const ok = await save(slots.filter((_, i) => i !== editing.index), 'Cours retiré.');
            if (ok) setEditing(null);
          }}
          onSave={async (slot) => {
            const next = editing.index === null ? [...slots, slot] : slots.map((s, i) => (i === editing.index ? slot : s));
            const ok = await save(next, editing.index === null ? 'Cours ajouté.' : 'Cours modifié.');
            if (ok) setEditing(null);
          }}
        />
      )}
      {copying && (
        <CopyForm
          sources={all.data.filter((t) => t.classId !== classId && t.slots.length)}
          onClose={() => setCopying(false)}
          onCopy={async (source) => {
            const ok = await save(source.slots, 'Horaire copié : adaptez les enseignants et les salles.');
            if (ok) setCopying(false);
          }}
        />
      )}
    </div>
  );
}

function SlotForm({
  slot,
  days,
  subjects,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  slot: TimetableSlot;
  days: Weekday[];
  subjects: string[];
  existing: boolean;
  onClose: () => void;
  onSave: (s: TimetableSlot) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { members } = useSchool();
  const [s, setS] = useState(slot);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TimetableSlot>) => setS((x) => ({ ...x, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (s.end <= s.start) return setError("L'heure de fin doit être après l'heure de début.");
    setBusy(true);
    await onSave({ ...s, subject: s.subject.trim(), teacher: s.teacher?.trim() || undefined, room: s.room?.trim() || undefined });
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} title={existing ? 'Modifier le cours' : 'Ajouter un cours'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <SelectField label="Jour" value={s.day} onChange={(e) => set({ day: Number(e.target.value) as Weekday })}>
          {days.map((d) => (
            <option key={d} value={d}>
              {WEEKDAY_LABELS[d]}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Début" type="time" value={s.start} onChange={(e) => set({ start: e.target.value })} required />
          <Field label="Fin" type="time" value={s.end} onChange={(e) => set({ end: e.target.value })} required />
        </div>
        <Field label="Cours" list="tt-subjects" value={s.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Mathématiques, Récréation…" required />
        <datalist id="tt-subjects">
          {[...subjects, 'Récréation'].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Enseignant (facultatif)" list="tt-teachers" value={s.teacher ?? ''} onChange={(e) => set({ teacher: e.target.value })} />
          <Field label="Salle (facultatif)" value={s.room ?? ''} onChange={(e) => set({ room: e.target.value })} />
        </div>
        <datalist id="tt-teachers">
          {members
            .filter((m) => m.role === 'professeur')
            .map((m) => (
              <option key={m.email} value={m.name} />
            ))}
        </datalist>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {existing ? (
            <Button variant="ghost" className="text-danger-ink hover:bg-danger-soft" onClick={() => void onDelete()}>
              Retirer ce cours
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={busy}>
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CopyForm({ sources, onClose, onCopy }: { sources: Timetable[]; onClose: () => void; onCopy: (t: Timetable) => Promise<void> }) {
  const { classById } = useSchool();
  const [id, setId] = useState(sources[0]?.classId ?? '');
  const [busy, setBusy] = useState(false);
  const source = sources.find((t) => t.classId === id);
  return (
    <Modal
      open
      onClose={onClose}
      title="Copier l'horaire d'une autre classe"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={busy}
            disabled={!source}
            onClick={async () => {
              setBusy(true);
              await onCopy(source!);
              setBusy(false);
            }}
          >
            Copier
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SelectField label="Classe source" value={id} onChange={(e) => setId(e.target.value)}>
          {sources.map((t) => (
            <option key={t.classId} value={t.classId}>
              {classById.get(t.classId)?.name ?? t.classId} · {t.slots.length} cours
            </option>
          ))}
        </SelectField>
        <p className="text-sm text-ink-2">L'horaire actuel de cette classe sera remplacé.</p>
      </div>
    </Modal>
  );
}
