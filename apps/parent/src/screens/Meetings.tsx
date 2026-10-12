import { formatLongCap, formatShort, todayISO, type AppointmentSlot } from '@pe/shared';
import { bookSlot, cancelBooking, errorMessage } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { Button, ErrorNote, Modal, TextArea, useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { SubHeader } from '../components/ChildPicker';
import { DateBox, EmptyState, List, Note, Pill, Row, Section, Tile } from '../components/kit';
import { useParentData, type Child } from '../data';
import { nameInitials } from '../helpers';
import type { Nav } from '../nav';
import { RsvpButtons } from './Home';

const STATUS = {
  requested: { label: 'En attente', tone: 'warn' },
  confirmed: { label: 'Confirmé', tone: 'ok' },
  declined: { label: 'Décliné', tone: 'bad' },
  open: { label: 'Libre', tone: 'mute' },
} as const;

export function MeetingsScreen({ nav }: { nav: Nav }) {
  const { user } = useAuth();
  const { active } = useParentData();
  const toast = useToast();
  const [booking, setBooking] = useState<AppointmentSlot | null>(null);
  if (!active) return null;
  const today = todayISO();
  const meetings = active.events.filter((e) => (e.category === 'Réunion' || e.rsvp) && (e.endDate || e.date) >= today);
  const mine = active.slots.filter((s) => s.bookedBy === user?.uid && s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const open = active.slots.filter((s) => s.status === 'open' && s.date >= today);
  const teachers = [...new Set(open.map((s) => s.teacherEmail))];

  return (
    <div>
      <SubHeader title="Réunions et rendez-vous" subtitle={active.student.firstName} onBack={nav.back} />

      <Section title="Réunions prévues" />
      {meetings.length === 0 ? (
        <List>
          <Row left={<Tile icon="handshake" tone="g" />} title="Aucune réunion annoncée" sub="Les réunions de parents apparaîtront ici" />
        </List>
      ) : (
        <div className="flex flex-col gap-3">
          {meetings.map((e) => (
            <div key={e.id} className="pe-card mx-4 flex items-start gap-3.5 p-4">
              <DateBox date={e.date} tone="ok" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{e.title}</div>
                <div className="text-[13px] text-ink-3">{[e.time, e.place].filter(Boolean).join(' · ') || formatLongCap(e.date)}</div>
                {e.description && <p className="mt-1 text-[13px] text-ink-2">{e.description}</p>}
                {e.rsvp && (
                  <div className="mt-2.5">
                    <RsvpButtons child={active} event={e} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <>
          <Section title="Mes rendez-vous" />
          <List>
            {mine.map((s) => (
              <Row
                key={s.id}
                left={<span className="tone-g flex size-[42px] shrink-0 items-center justify-center rounded-full text-sm font-semibold">{nameInitials(s.teacherName)}</span>}
                title={`${s.teacherName} · ${formatShort(s.date)} à ${s.start}`}
                sub={[s.place, s.studentName ? `pour ${s.studentName}` : null].filter(Boolean).join(' · ')}
                end={
                  <span className="flex flex-col items-end gap-1">
                    <Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill>
                    {(s.status === 'requested' || s.status === 'confirmed') && (
                      <button
                        type="button"
                        onClick={() =>
                          void cancelBooking(getFirebase().db, s)
                            .then(() => toast('Rendez-vous annulé.'))
                            .catch((err) => toast(errorMessage(err), 'error'))
                        }
                        className="text-[12px] font-semibold text-ink-3"
                      >
                        Annuler
                      </button>
                    )}
                  </span>
                }
              />
            ))}
          </List>
        </>
      )}

      <Section title="Prendre rendez-vous" />
      {teachers.length === 0 ? (
        <EmptyState icon="calendar-plus" tone="g" title="Aucun créneau proposé">
          Quand un enseignant ou la direction propose des créneaux à la classe de {active.student.firstName}, vous pourrez en réserver un ici.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {teachers.map((t) => {
            const slots = open.filter((s) => s.teacherEmail === t).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
            return (
              <div key={t} className="pe-card mx-4 p-4">
                <div className="flex items-center gap-3">
                  <span className="tone-g flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold">{nameInitials(slots[0].teacherName)}</span>
                  <div>
                    <div className="font-semibold">{slots[0].teacherName}</div>
                    <div className="text-[12.5px] text-ink-3">{slots[0].place || 'Créneaux proposés'}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button key={s.id} type="button" onClick={() => setBooking(s)} className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink-2">
                      {formatShort(s.date)} · {s.start}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Note icon="clock">L'enseignant confirme votre demande ; vous recevez une notification dès qu'il répond.</Note>
      {booking && <BookingDialog slot={booking} child={active} onClose={() => setBooking(null)} />}
    </div>
  );
}

function BookingDialog({ slot, child, onClose }: { slot: AppointmentSlot; child: Child; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function book() {
    setBusy(true);
    setError(null);
    try {
      await bookSlot(getFirebase().db, slot, {
        uid: user!.uid,
        name: user!.displayName || user!.email || 'Parent',
        studentId: child.id,
        studentName: `${child.student.firstName} ${child.student.lastName}`,
        note,
      });
      toast('Demande envoyée : vous serez prévenu de la réponse.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Demander ce rendez-vous"
      sheet
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} onClick={() => void book()}>
            Envoyer la demande
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-[15px]">
          <strong>{slot.teacherName}</strong> · {formatLongCap(slot.date)}, de {slot.start} à {slot.end}
          {slot.place ? ` · ${slot.place}` : ''}
        </p>
        <TextArea label="Sujet du rendez-vous (facultatif)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Parler des résultats en mathématiques." />
      </div>
    </Modal>
  );
}

