import {
  ATTENDANCE_LABELS,
  formatLongCap,
  formatMonth,
  formatShort,
  holidayOn,
  parseISODate,
  schoolBreakOn,
  schoolYear,
  todayISO,
  toISODate,
  type Attendance,
} from '@pe/shared';
import { errorMessage, justifyAbsence } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Button, ErrorNote, Modal, TextArea, cx, useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { EmptyState, List, Note, Pill, Row, Section, Tile } from '../components/kit';
import type { Child } from '../data';
import { accord } from '../format';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Couleur du point sous le jour. */
const DOT: Record<Attendance['status'], string> = {
  present: 'bg-ok',
  late: 'bg-[#d18a00]',
  excused: 'bg-info',
  absent: 'bg-danger',
};

export function AttendanceView({ child: c }: { child: Child }) {
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [justifying, setJustifying] = useState<Attendance | null>(null);
  const startYear = (c.school?.schoolYear || schoolYear(today)).slice(0, 4);
  const firstMonth = `${startYear}-09`;
  const canPrev = month > firstMonth;
  const canNext = month < today.slice(0, 7);
  const shift = (delta: number) => {
    const d = parseISODate(`${month}-01`);
    d.setMonth(d.getMonth() + delta);
    setMonth(toISODate(d).slice(0, 7));
  };

  const byDate = new Map(c.attendance.map((a) => [a.date, a]));
  const monthRecs = c.attendance.filter((a) => a.date.startsWith(month));
  const count = (s: Attendance['status']) => monthRecs.filter((a) => a.status === s).length;
  const rate = monthRecs.length ? Math.round(((monthRecs.length - count('absent')) / monthRecs.length) * 100) : null;
  const issues = monthRecs.filter((a) => a.status !== 'present').sort((a, b) => b.date.localeCompare(a.date));

  const first = parseISODate(`${month}-01`);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const offDays = dates
    .map((d) => {
      const h = holidayOn(d);
      const b = schoolBreakOn(d, c.events);
      return h ? { date: d, name: h.name, holiday: true } : b ? { date: d, name: b.title, holiday: false } : null;
    })
    .filter((x): x is { date: string; name: string; holiday: boolean } => !!x);
  const offByDate = new Map(offDays.map((o) => [o.date, o]));
  const eventDays = new Set(c.events.filter((e) => e.category !== 'Congé').map((e) => e.date));
  // Congés sur plusieurs jours : une seule ligne dans la liste.
  const offList = offDays.filter((o, i) => o.holiday || offDays[i - 1]?.name !== o.name);

  return (
    <>
      <div className="px-3 pt-3">
        <div className="mb-1 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Mois précédent" className="flex size-11 items-center justify-center rounded-full text-ink-2 disabled:text-ink-4/50">
            <Icon name="caret-left" size={20} />
          </button>
          <div className="text-center">
            <div className="text-base font-semibold" aria-live="polite">
              {formatMonth(first)}
            </div>
            <div className="text-[13px] text-ink-3">{rate === null ? "Pas encore d'appel ce mois-ci" : `Présence : ${rate} %`}</div>
          </div>
          <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Mois suivant" className="flex size-11 items-center justify-center rounded-full text-ink-2 disabled:text-ink-4/50">
            <Icon name="caret-right" size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={i} aria-hidden="true" className="py-1 text-xs font-semibold text-ink-4">
              {w}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`e${i}`} />
          ))}
          {dates.map((iso, i) => {
            const rec = byDate.get(iso);
            const off = offByDate.get(iso);
            const wd = (offset + i) % 7;
            const label = [formatLongCap(iso), rec ? ATTENDANCE_LABELS[rec.status] : null, off?.name].filter(Boolean).join(' · ');
            const isToday = iso === today;
            return (
              <span key={iso} title={label} aria-label={label} className="flex h-11 flex-col items-center justify-center gap-[3px]">
                <span
                  className={cx(
                    'flex h-[26px] min-w-8 items-center justify-center rounded-full px-1 text-[15px] tabular-nums',
                    isToday ? 'bg-brand font-semibold text-white' : off ? 'font-medium text-danger line-through' : wd >= 5 && !rec ? 'text-ink-4' : 'text-ink',
                  )}
                >
                  {Number(iso.slice(8))}
                </span>
                <span
                  className={cx(
                    'size-[5px] rounded-full',
                    rec ? DOT[rec.status] : eventDays.has(iso) ? 'size-[6px] border-[1.5px] border-ink-3' : '',
                  )}
                />
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-2 pt-2.5 text-xs text-ink-2">
          <Legend className="bg-ok" label={`Présent ${count('present')}`} />
          <Legend className="bg-[#d18a00]" label={`Retard ${count('late')}`} />
          <Legend className="bg-info" label={`Justifiée ${count('excused')}`} />
          <Legend className="bg-danger" label={`Absent ${count('absent')}`} />
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-danger line-through">13</span>Pas de cours
          </span>
        </div>
      </div>

      {offList.length > 0 && (
        <>
          <Section title="Jours sans cours" />
          <List>
            {offList.map((o) => (
              <Row
                key={o.date}
                left={<Tile icon={o.holiday ? 'calendar-x' : 'calendar-blank'} tone={o.holiday ? 'c' : 'b'} />}
                title={o.name}
                sub={o.holiday ? `${formatLongCap(o.date)} · jour férié légal` : `À partir du ${formatShort(o.date)} · congé de l'école`}
              />
            ))}
          </List>
        </>
      )}

      {issues.length > 0 ? (
        <>
          <Section title="Absences et retards" count={issues.length} />
          <List>
            {issues.map((a) => (
              <IssueRow key={a.id} a={a} onJustify={() => setJustifying(a)} />
            ))}
          </List>
        </>
      ) : monthRecs.length > 0 ? (
        <Note icon="sparkle">
          Aucune absence ni retard ce mois-ci. {c.student.firstName} est {accord(c.student, 'assidu', 'assidue')}, bravo !
        </Note>
      ) : (
        <EmptyState icon="calendar-check" tone="t" title="Rien à signaler">
          Les présences apparaissent ici dès que l'école fait l'appel.
        </EmptyState>
      )}
      <Note icon="first-aid-kit">Pour justifier une absence ou un retard, touchez-le dans la liste : l'école reçoit votre message aussitôt.</Note>
      <JustifyDialog record={justifying} onClose={() => setJustifying(null)} />
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('size-[7px] rounded-full', className)} />
      {label}
    </span>
  );
}

function IssueRow({ a, onJustify }: { a: Attendance; onJustify: () => void }) {
  const canJustify = (a.status === 'absent' || a.status === 'late') && (!a.justificationStatus || a.justificationStatus === 'rejected');
  const badge =
    a.status === 'excused' || a.justificationStatus === 'accepted' ? (
      <Pill tone="info">Justifiée</Pill>
    ) : a.justificationStatus === 'pending' ? (
      <Pill tone="warn">En attente</Pill>
    ) : a.justificationStatus === 'rejected' ? (
      <Pill tone="bad">Refusée</Pill>
    ) : a.status === 'late' ? (
      <Pill tone="warn">Retard</Pill>
    ) : (
      <Pill tone="bad">Non justifiée</Pill>
    );
  return (
    <Row
      left={<Tile icon={a.status === 'late' ? 'clock' : a.status === 'excused' ? 'first-aid-kit' : 'warning-circle'} tone={a.status === 'late' ? 'a' : a.status === 'excused' ? 'b' : 'c'} />}
      title={formatLongCap(a.date)}
      sub={a.justification ? `Votre message : « ${a.justification} »` : [a.reason, `signalé par ${a.recordedByName}`].filter(Boolean).join(' · ')}
      end={badge}
      onClick={canJustify ? onJustify : undefined}
    />
  );
}

function JustifyDialog({ record, onClose }: { record: Attendance | null; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const MOTIFS = ['Maladie', 'Raison familiale', 'Rendez-vous médical', 'Deuil', 'Transport'];

  async function send() {
    const message = [motif, text.trim()].filter(Boolean).join(' : ');
    if (!record || !message) return;
    setBusy(true);
    setError(null);
    try {
      await justifyAbsence(getFirebase().db, record.studentId, record.date, message);
      toast('Justification envoyée à l’école.');
      setText('');
      setMotif('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!record}
      onClose={onClose}
      title={record?.status === 'late' ? 'Justifier un retard' : 'Justifier une absence'}
      sheet
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void send()} loading={busy} disabled={!motif && !text.trim()}>
            Envoyer à l'école
          </Button>
        </>
      }
    >
      {record && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">{formatLongCap(record.date)}</p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div role="group" aria-label="Motif" className="flex flex-wrap gap-2">
            {MOTIFS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={motif === m}
                onClick={() => setMotif(motif === m ? '' : m)}
                className={cx('h-9 rounded-full border px-3.5 text-[13px] font-semibold', motif === m ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-2')}
              >
                {m}
              </button>
            ))}
          </div>
          <TextArea
            label="Message pour l'école"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex. : fièvre, elle reste à la maison ; certificat remis demain."
            maxLength={500}
            hint="L'école verra ce message et pourra accepter ou refuser la justification."
          />
        </div>
      )}
    </Modal>
  );
}
