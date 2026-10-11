import { formatLongCap, todayISO, type AppointmentSlot, type SlotStatus } from '@pe/shared';
import { createSlots, deleteSlot, q, setSlotStatus } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Checkbox, Empty, ErrorNote, Field, Modal, Segmented, SelectField } from '@pe/shared/ui';
import { CalendarCheck, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAccess, useRole } from '../access';
import { ConfirmAction, PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

const STATUS: Record<SlotStatus, { label: string; tone: 'neutral' | 'warn' | 'brand' | 'danger' }> = {
  open: { label: 'Libre', tone: 'neutral' },
  requested: { label: 'Demandé', tone: 'warn' },
  confirmed: { label: 'Confirmé', tone: 'brand' },
  declined: { label: 'Décliné', tone: 'danger' },
};

/** « 14:00 » + 20 min → « 14:20 » */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function AppointmentsPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { schoolId, classById } = useSchool();
  const all = useLiveQuery<AppointmentSlot>(`slots:${schoolId}`, () => q.slots(db, schoolId));
  const [scope, setScope] = useState<'mine' | 'all'>(role === 'admin' ? 'all' : 'mine');
  const [adding, setAdding] = useState(false);
  const { run } = useAction();
  const today = todayISO();
  const mine = (s: AppointmentSlot) => s.teacherEmail === access.email;
  const canManage = (s: AppointmentSlot) => role === 'admin' || mine(s);
  const list = all.data.filter((s) => s.date >= today && (scope === 'all' || mine(s)));
  const requests = list.filter((s) => s.status === 'requested');
  const dates = [...new Set(list.map((s) => s.date))];

  return (
    <div>
      <PageHeader
        title="Rendez-vous"
        description="Proposez des créneaux : les parents en réservent un depuis l'application, vous confirmez. Fini les convocations perdues dans le cartable."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Proposer des créneaux
          </Button>
        }
      />
      {role === 'admin' && (
        <Segmented
          label="Créneaux affichés"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Tous les enseignants' },
            { value: 'mine', label: 'Mes créneaux' },
          ]}
          className="mb-4 sm:max-w-md"
        />
      )}

      {requests.length > 0 && (
        <section className="mb-6 flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold">À confirmer ({requests.length})</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {requests.map((s) => (
              <Card as="li" key={s.id} className="flex flex-col gap-2 border-warn/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">{formatLongCap(s.date)}</Badge>
                  <span className="text-sm font-semibold">
                    {s.start} – {s.end}
                  </span>
                  {scope === 'all' && <span className="text-sm text-ink-3">· {s.teacherName}</span>}
                </div>
                <span className="font-bold">
                  {s.bookedByName} · parent de {s.studentName}
                </span>
                {s.note && <p className="rounded-xl bg-ground px-3 py-2 text-sm text-ink-2">« {s.note} »</p>}
                {canManage(s) && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => void run(() => setSlotStatus(db, s, 'confirmed'), 'Rendez-vous confirmé : le parent est prévenu.')}>
                      Confirmer
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger-ink hover:bg-danger-soft" onClick={() => void run(() => setSlotStatus(db, s, 'declined'), 'Demande déclinée : le parent est prévenu.')}>
                      Décliner
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <Empty icon={<CalendarCheck size={22} />} title="Aucun créneau à venir">
          Proposez par exemple six créneaux de 20 minutes le vendredi après les cours.
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {dates.map((d) => (
            <section key={d} className="flex flex-col gap-2">
              <h2 className="font-display text-base font-bold">{formatLongCap(d)}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list
                  .filter((s) => s.date === d)
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map((s) => (
                    <Card as="li" key={s.id} className="flex flex-col gap-1.5 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">
                          {s.start} – {s.end}
                        </span>
                        <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                      </div>
                      <span className="text-sm text-ink-2">
                        {s.teacherName}
                        {s.place ? ` · ${s.place}` : ''}
                      </span>
                      {s.studentName && s.status !== 'open' && <span className="text-sm">Parent de {s.studentName}</span>}
                      <span className="text-xs text-ink-3">{s.classIds.length ? s.classIds.map((id) => classById.get(id)?.name ?? '?').join(', ') : 'Toutes les classes'}</span>
                      {canManage(s) && (
                        <div className="flex flex-wrap gap-1">
                          {s.status === 'confirmed' && (
                            <Button size="sm" variant="ghost" onClick={() => void run(() => setSlotStatus(db, s, 'declined'), 'Rendez-vous annulé : le parent est prévenu.')}>
                              Annuler
                            </Button>
                          )}
                          <ConfirmAction
                            label="Supprimer"
                            title="Supprimer ce créneau ?"
                            message={s.status === 'open' ? 'Il ne sera plus proposé aux parents.' : `Le rendez-vous avec le parent de ${s.studentName} sera supprimé sans le prévenir. Préférez « Annuler ».`}
                            onConfirm={() => deleteSlot(db, schoolId, s.id)}
                          />
                        </div>
                      )}
                    </Card>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {adding && <SlotsForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function SlotsForm({ onClose }: { onClose: () => void }) {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { schoolId, myClasses, classes, members } = useSchool();
  const { busy, run } = useAction();
  const teachers = role === 'admin' ? members.filter((m) => m.active && m.role !== 'caissier') : [];
  const [teacher, setTeacher] = useState(access.email);
  const [date, setDate] = useState('');
  const [start, setStart] = useState('14:00');
  const [duration, setDuration] = useState('20');
  const [count, setCount] = useState('6');
  const [place, setPlace] = useState('');
  const choices = role === 'admin' ? classes : myClasses;
  const [classIds, setClassIds] = useState<string[]>(role === 'admin' ? [] : myClasses.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  const n = Math.max(1, Math.min(20, Number(count) || 1));
  const minutes = Number(duration);
  const preview = Array.from({ length: n }, (_, i) => addMinutes(start, i * minutes));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (addMinutes(start, n * minutes) < start) return setError('Les créneaux dépassent minuit : réduisez leur nombre.');
    const t = members.find((m) => m.email === teacher);
    const ok = await run(async () => {
      await createSlots(
        db,
        preview.map((s) => ({
          schoolId,
          teacherEmail: teacher,
          teacherName: t?.name ?? access.name,
          date,
          start: s,
          end: addMinutes(s, minutes),
          place: place.trim() || undefined,
          classIds,
        })),
      );
      return true;
    }, `${n} créneau${n > 1 ? 'x' : ''} proposé${n > 1 ? 's' : ''} aux parents.`);
    if (ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Proposer des créneaux" wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {teachers.length > 0 && (
          <SelectField label="Enseignant" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            {!teachers.some((m) => m.email === access.email) && <option value={access.email}>{access.name} (moi)</option>}
            {teachers.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name}
              </option>
            ))}
          </SelectField>
        )}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date" type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} required wrapperClassName="sm:col-span-2" />
          <Field label="Premier créneau" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          <SelectField label="Durée" value={duration} onChange={(e) => setDuration(e.target.value)}>
            {['10', '15', '20', '30', '45', '60'].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </SelectField>
          <Field label="Nombre de créneaux" type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} />
          <Field label="Lieu (facultatif)" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Salle des professeurs" wrapperClassName="sm:col-span-3" />
        </div>
        <p className="rounded-xl bg-ground px-3.5 py-2.5 text-sm text-ink-2">
          Créneaux : {preview.map((p) => `${p}–${addMinutes(p, minutes)}`).join(', ')}
        </p>
        <fieldset>
          <legend className="mb-1 text-sm font-bold">Parents des classes (aucune cochée = toutes)</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            {choices.map((c) => (
              <Checkbox key={c.id} label={c.name} checked={classIds.includes(c.id)} onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))} />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Proposer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
