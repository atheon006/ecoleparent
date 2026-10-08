import { formatLongCap, todayISO, type Attendance, type AttendanceStatus } from '@pe/shared';
import { q, saveClassAttendance } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Empty, ErrorNote, cx } from '@pe/shared/ui';
import { ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAccess } from '../access';
import { PageHeader, useAction } from '../components/common';
import { fullName, useSchool } from '../school';

type Mark = { status: Exclude<AttendanceStatus, 'present'>; reason?: string };

export function RollCallPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const { schoolId, students, myClasses } = useSchool();
  const [classId, setClassId] = useState(myClasses[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const { busy, run } = useAction();
  const existing = useLiveQuery<Attendance>(`att-day:${schoolId}:${date}`, () => q.schoolAttendanceOn(db, schoolId, date));
  const classStudents = students.filter((s) => s.active && s.classId === classId);
  const recorded = existing.data.filter((a) => a.classId === classId);

  // Appel déjà fait : on recharge les absents et retards enregistrés.
  const recordedKey = recorded.map((r) => `${r.studentId}:${r.status}`).join('|');
  useEffect(() => {
    const m: Record<string, Mark> = {};
    for (const r of recorded) if (r.status !== 'present') m[r.studentId] = { status: r.status, reason: r.reason };
    setMarks(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, recordedKey]);

  if (myClasses.length === 0) {
    return (
      <div>
        <PageHeader title="Appel" />
        <Empty icon={<ClipboardCheck size={22} />} title="Aucune classe attribuée">
          Demandez à la direction de vous attribuer vos classes dans la page Personnel.
        </Empty>
      </div>
    );
  }

  const toggle = (id: string, status: Mark['status']) =>
    setMarks((m) => {
      const n = { ...m };
      if (n[id]?.status === status) delete n[id];
      else n[id] = { status, reason: n[id]?.reason };
      return n;
    });

  const absents = Object.values(marks).filter((m) => m.status === 'absent').length;
  const lates = Object.values(marks).filter((m) => m.status === 'late').length;
  const presents = classStudents.length - Object.keys(marks).filter((id) => classStudents.some((s) => s.id === id)).length;

  async function save() {
    await run(
      () =>
        saveClassAttendance(db, {
          schoolId,
          classId,
          date,
          students: classStudents,
          marks,
          recordedBy: access.email,
          recordedByName: access.name,
          previous: Object.fromEntries(existing.data.map((a) => [a.studentId, a.status])),
        }),
      `Appel enregistré : ${presents} présents, ${absents} absent${absents > 1 ? 's' : ''}, ${lates} retard${lates > 1 ? 's' : ''}.`,
    );
  }

  return (
    <div>
      <PageHeader title="Appel" description="Cochez seulement les absents et les retards : tous les autres élèves sont marqués présents. Les parents sont informés dans l'application." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-bold">
          Classe
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-12 rounded-xl border border-[#c4ccc6] bg-surface px-3 text-[16px] font-normal">
            {myClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold sm:w-48">
          Date
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl border border-[#c4ccc6] bg-surface px-3 font-normal" />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-2">{formatLongCap(date)}</span>
        {recorded.length > 0 ? <Badge tone="brand">Appel déjà enregistré, vous pouvez le corriger</Badge> : <Badge tone="neutral">Appel pas encore fait</Badge>}
      </div>

      {classStudents.length === 0 ? (
        <ErrorNote>Aucun élève inscrit dans cette classe.</ErrorNote>
      ) : (
        <Card as="div" className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {classStudents.map((s, i) => {
              const m = marks[s.id];
              return (
                <li key={s.id} className={cx('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center', m?.status === 'absent' && 'bg-danger-soft/60', m?.status === 'late' && 'bg-warn-soft/60')}>
                  <span className="flex flex-1 items-center gap-3">
                    <span className="w-6 text-right text-sm text-ink-3">{i + 1}</span>
                    <span className="font-semibold">{fullName(s)}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 pl-9 sm:pl-0">
                    {m?.status === 'excused' && <Badge tone="info">Absence justifiée</Badge>}
                    {m && m.status !== 'excused' && (
                      <input
                        aria-label={`Motif pour ${s.firstName}`}
                        placeholder="Motif (facultatif)"
                        value={m.reason ?? ''}
                        onChange={(e) => setMarks((x) => ({ ...x, [s.id]: { ...m, reason: e.target.value } }))}
                        className="h-10 rounded-lg border border-[#c4ccc6] bg-surface px-2.5 text-sm sm:w-48"
                      />
                    )}
                    <button
                      type="button"
                      aria-pressed={m?.status === 'absent'}
                      onClick={() => toggle(s.id, 'absent')}
                      className={cx('min-h-10 rounded-lg border px-3 text-sm font-bold', m?.status === 'absent' ? 'border-danger bg-danger text-white' : 'border-line text-ink-2 hover:border-danger')}
                    >
                      Absent
                    </button>
                    <button
                      type="button"
                      aria-pressed={m?.status === 'late'}
                      onClick={() => toggle(s.id, 'late')}
                      className={cx('min-h-10 rounded-lg border px-3 text-sm font-bold', m?.status === 'late' ? 'border-chalk bg-chalk text-ink' : 'border-line text-ink-2 hover:border-chalk')}
                    >
                      Retard
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3">
            <span className="text-sm text-ink-2">
              <strong>{presents}</strong> présents · <strong className="text-danger-ink">{absents}</strong> absents ·{' '}
              <strong className="text-warn">{lates}</strong> retards
            </span>
            <Button onClick={() => void save()} loading={busy}>
              Enregistrer l'appel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
