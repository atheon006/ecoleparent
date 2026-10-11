import {
  EVENT_CATEGORIES,
  addDays,
  formatLongCap,
  formatShort,
  holidaysBetween,
  todayISO,
  type EventCategory,
  type Rsvp,
  type SchoolEvent,
} from '@pe/shared';
import { deleteEvent, q, saveEvent } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveMany, useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Checkbox, Empty, ErrorNote, Field, Modal, SelectField, TextArea } from '@pe/shared/ui';
import { CalendarDays, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmAction, PageHeader, Table, useAction } from '../components/common';
import { useSchool } from '../school';

const tone = { Paiement: 'danger', Examen: 'info', Réunion: 'brand', Congé: 'warn', Activité: 'neutral' } as const;

type Row = { kind: 'event'; e: SchoolEvent } | { kind: 'holiday'; date: string; name: string };

export function EventsPage() {
  const { db } = getFirebase();
  const { schoolId, classById } = useSchool();
  const events = useLiveQuery<SchoolEvent>(`ev:${schoolId}`, () => q.events(db, schoolId));
  const [editing, setEditing] = useState<SchoolEvent | 'new' | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [rsvpOf, setRsvpOf] = useState<SchoolEvent | null>(null);
  const today = todayISO();
  const withRsvp = events.data.filter((e) => e.rsvp && (e.endDate || e.date) >= today);
  const rsvps = useLiveMany<Rsvp>(withRsvp.map((e) => ({ key: `rsvp:${e.id}`, make: () => q.eventRsvps(db, schoolId, e.id) })));

  // Jours fériés légaux : ajoutés d'office, sur un an (ou depuis le début de l'année avec les dates passées).
  const from = showPast ? addDays(today, -365) : today;
  const holidays: Row[] = holidaysBetween(from, addDays(today, 365)).map((h) => ({ kind: 'holiday', date: h.date, name: h.name }));
  const rows: Row[] = [
    ...events.data.filter((e) => showPast || (e.endDate || e.date) >= today).map((e): Row => ({ kind: 'event', e })),
    ...holidays,
  ].sort((a, b) => (a.kind === 'event' ? a.e.date : a.date).localeCompare(b.kind === 'event' ? b.e.date : b.date));

  const count = (e: SchoolEvent, answer: 'yes' | 'no') => (rsvps.data[`rsvp:${e.id}`] ?? []).filter((r) => r.answer === answer).length;

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Examens, réunions, congés et dates de paiement, dans le calendrier de l'application des parents. Les jours fériés légaux y figurent d'office."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')}>
            Ajouter une date
          </Button>
        }
      />
      <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-2">
        <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="size-4 accent-[#1e4a38]" />
        Afficher les dates passées
      </label>
      {rows.length === 0 ? (
        <Empty icon={<CalendarDays size={22} />} title="Aucune date à venir" />
      ) : (
        <Table head={['Date', 'Catégorie', 'Événement', '']}>
          {rows.map((r) =>
            r.kind === 'holiday' ? (
              <tr key={`h-${r.date}`} className={r.date < today ? 'opacity-60' : undefined}>
                <td className="whitespace-nowrap">{formatLongCap(r.date)}</td>
                <td>
                  <Badge tone="danger">Férié</Badge>
                </td>
                <td>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[13px] text-ink-3">Jour férié légal · pas de cours</div>
                </td>
                <td />
              </tr>
            ) : (
              <tr key={r.e.id} className={(r.e.endDate || r.e.date) < today ? 'opacity-60' : undefined}>
                <td className="whitespace-nowrap">
                  {r.e.endDate && r.e.endDate !== r.e.date ? (
                    <>
                      Du {formatShort(r.e.date)}
                      <br />
                      au {formatShort(r.e.endDate)}
                    </>
                  ) : (
                    formatLongCap(r.e.date)
                  )}
                  {r.e.time && <div className="text-[13px] text-ink-3">{r.e.time}</div>}
                </td>
                <td>
                  <Badge tone={tone[r.e.category]}>{r.e.category}</Badge>
                </td>
                <td>
                  <div className="font-semibold">{r.e.title}</div>
                  <div className="text-[13px] text-ink-3">
                    {[r.e.place, r.e.classIds?.length ? r.e.classIds.map((id) => classById.get(id)?.name ?? '?').join(', ') : null, r.e.description].filter(Boolean).join(' · ')}
                  </div>
                  {r.e.rsvp && (
                    <button type="button" onClick={() => setRsvpOf(r.e)} className="mt-1 text-[13px] font-semibold text-brand hover:underline">
                      {count(r.e, 'yes')} viennent · {count(r.e, 'no')} ne viennent pas
                    </button>
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r.e)}>
                    Modifier
                  </Button>
                  <ConfirmAction label="Supprimer" title="Supprimer cette date ?" message={`« ${r.e.title} » sera retiré de l'agenda.`} onConfirm={() => deleteEvent(db, schoolId, r.e.id)} />
                </td>
              </tr>
            ),
          )}
        </Table>
      )}
      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {rsvpOf && (
        <Modal open onClose={() => setRsvpOf(null)} title={`Réponses · ${rsvpOf.title}`}>
          {(rsvps.data[`rsvp:${rsvpOf.id}`] ?? []).length === 0 ? (
            <p className="text-[15px] text-ink-2">Aucune réponse pour le moment.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {(rsvps.data[`rsvp:${rsvpOf.id}`] ?? []).map((x) => (
                <li key={x.uid} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-semibold">{x.name}</span>
                  <Badge tone={x.answer === 'yes' ? 'brand' : 'danger'}>{x.answer === 'yes' ? 'Vient' : 'Ne vient pas'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function EventForm({ event, onClose }: { event: SchoolEvent | null; onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId, classes } = useSchool();
  const { busy, run } = useAction();
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? '');
  const [endDate, setEndDate] = useState(event?.endDate ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [place, setPlace] = useState(event?.place ?? '');
  const [category, setCategory] = useState<EventCategory>(event?.category ?? 'Réunion');
  const [description, setDescription] = useState(event?.description ?? '');
  const [rsvp, setRsvp] = useState(event?.rsvp ?? false);
  const [classIds, setClassIds] = useState<string[]>(event?.classIds ?? []);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (endDate && endDate < date) return setError('La date de fin doit être après la date de début.');
    const id = await run(
      () =>
        saveEvent(db, {
          id: event?.id,
          schoolId,
          title: title.trim(),
          date,
          category,
          description: description.trim() || undefined,
          endDate: endDate && endDate !== date ? endDate : undefined,
          time: time || undefined,
          place: place.trim() || undefined,
          rsvp: rsvp || undefined,
          classIds: classIds.length ? classIds : undefined,
        }),
      event ? 'Date modifiée.' : 'Date ajoutée.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title={event ? 'Modifier la date' : 'Ajouter une date'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assemblée générale des parents" required />
        <div className="grid gap-4 sm:grid-cols-4">
          <SelectField label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Field label="Jusqu'au (facultatif)" type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} hint="Vacances, semaine d'examens" />
          <Field label="Heure (facultatif)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Field label="Lieu (facultatif)" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Grande salle" />
        <TextArea label="Détails (facultatif)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {category === 'Congé' && <p className="rounded-xl bg-warn-soft/60 px-3.5 py-2.5 text-sm">Un congé compte comme jour sans cours : l'appel de ces jours affiche un avertissement.</p>}
        {(category === 'Réunion' || category === 'Activité') && (
          <Checkbox label="Demander aux parents s'ils viennent" hint="Vous voyez le nombre de présents prévus." checked={rsvp} onChange={(e) => setRsvp(e.target.checked)} />
        )}
        <fieldset>
          <legend className="mb-1 text-sm font-bold">Classes concernées (aucune cochée = toute l'école)</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            {classes.map((c) => (
              <Checkbox key={c.id} label={c.name} checked={classIds.includes(c.id)} onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))} />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            {event ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
