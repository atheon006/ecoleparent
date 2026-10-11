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

const CELL: Record<Attendance['status'], string> = {
  present: 'bg-ok-soft text-ok',
  late: 'bg-warn-soft text-warn',
  excused: 'bg-info-soft text-info',
  absent: 'bg-danger-soft text-danger-ink',
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
      <div className="pe-card mx-4 mt-1.5 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Mois précédent" className="flex size-9 items-center justify-center rounded-full border border-line bg-surface disabled:opacity-35">
            <Icon name="caret-left" size={18} />
          </button>
          <div className="text-center">
            <div className="font-display text-[17px] font-extrabold" aria-live="polite">
              {formatMonth(first)}
            </div>
            <div className="text-xs text-ink-3">{rate === null ? "Pas encore d'appel ce mois-ci" : `Taux de présence : ${rate} %`}</div>
          </div>
          <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Mois suivant" className="flex size-9 items-center justify-center rounded-full border border-line bg-surface disabled:opacity-35">
            <Icon name="caret-right" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={i} aria-hidden="true" className="py-1 text-[11px] font-bold text-ink-3">
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
            return (
              <span
                key={iso}
                title={label}
                aria-label={label}
                className={cx(
                  'relative flex h-[38px] items-center justify-center rounded-xl text-[13px] font-bold tabular-nums',
                  rec ? CELL[rec.status] : off ? (off.holiday ? 'tone-c' : 'bg-muted text-ink-3') : wd >= 5 ? 'font-medium text-ink-3 opacity-60' : '',
                  iso === today && 'ring-2 ring-brand ring-inset',
                )}
              >
                {Number(iso.slice(8))}
                {eventDays.has(iso) && <span className="absolute bottom-[5px] size-[5px] rounded-full bg-chalk" />}
              </span>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-2">
          <Legend className="bg-[var(--ok)]" label={`Présent ${count('present')}`} />
          <Legend className="bg-chalk" label={`Retard ${count('late')}`} />
          <Legend className="bg-info" label={`Justifiée ${count('excused')}`} />
          <Legend className="bg-danger" label={`Absent ${count('absent')}`} />
          <Legend className="tone-c border border-danger/40" label="Férié" />
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
      <span className={cx('size-2.5 rounded-[3px]', className)} />
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
