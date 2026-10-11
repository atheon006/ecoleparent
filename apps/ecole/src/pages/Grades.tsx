import {
  PERIODS,
  PERIOD_BY_ID,
  averageScore,
  formatPercent,
  formatShort,
  periodMax,
  runningPercent,
  subjectPeriodPoints,
  todayISO,
  type ClassRoom,
  type Evaluation,
  type Grade,
  type PeriodId,
} from '@pe/shared';
import { deleteEvaluation, q, saveEvaluation } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Empty, ErrorNote, Field, Modal, Segmented, SelectField, cx } from '@pe/shared/ui';
import { GraduationCap, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAccess, useRole } from '../access';
import { ConfirmAction, PageHeader, Table, downloadCsv, useAction } from '../components/common';
import { fullName, useSchool } from '../school';

/** Période probable d'après le mois (rentrée en septembre) : simple point de départ, modifiable. */
export function guessPeriod(today = todayISO()): PeriodId {
  const m = Number(today.slice(5, 7));
  if (m >= 9 && m <= 10) return 'P1';
  if (m >= 11) return 'P2';
  if (m <= 2) return 'P3';
  if (m <= 4) return 'P4';
  return 'EX2';
}

export function ClassPicker({ classes, value, onChange }: { classes: ClassRoom[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-sm font-bold">
      Classe
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 rounded-xl border border-[#c4ccc6] bg-surface px-3 text-[16px] font-normal">
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);

export function GradesPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { schoolId, myClasses, year } = useSchool();
  const [classId, setClassId] = useState(myClasses[0]?.id ?? '');
  const [period, setPeriod] = useState<PeriodId>(guessPeriod);
  const [view, setView] = useState<'evaluations' | 'recap'>('evaluations');
  const [editing, setEditing] = useState<Evaluation | 'new' | null>(null);
  const cls = myClasses.find((c) => c.id === classId);
  const evals = useLiveQuery<Evaluation>(classId ? `evals:${schoolId}:${classId}` : null, () => q.classEvaluations(db, schoolId, classId));
  const list = evals.data.filter((e) => e.year === year && e.period === period);

  if (myClasses.length === 0) {
    return (
      <div>
        <PageHeader title="Notes" />
        <Empty icon={<GraduationCap size={22} />} title="Aucune classe attribuée">
          Demandez à la direction de vous attribuer vos classes dans la page Personnel.
        </Empty>
      </div>
    );
  }

  const canEdit = (e: Evaluation) => role === 'admin' || e.createdBy === access.email;
  const subjects = cls?.subjects ?? [];

  return (
    <div>
      <PageHeader
        title="Notes"
        description={`Interrogations, devoirs notés et examens. Chaque parent voit les notes de son enfant dès leur enregistrement. Année ${year}.`}
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')} disabled={!subjects.length}>
            Nouvelle évaluation
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <ClassPicker classes={myClasses} value={classId} onChange={setClassId} />
        <SelectField label="Période" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)} wrapperClassName="sm:w-64">
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </div>

      {!subjects.length ? (
        <ErrorNote>
          Les branches de cette classe ne sont pas encore indiquées.{' '}
          {role === 'admin' ? (
            <>
              Ajoutez-les dans{' '}
              <a href="#/classes" className="font-bold underline">
                Classes
              </a>{' '}
              (bouton « Branches »).
            </>
          ) : (
            'Demandez à la direction de les ajouter.'
          )}
        </ErrorNote>
      ) : (
        <>
          <Segmented
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: 'evaluations', label: 'Évaluations' },
              { value: 'recap', label: 'Récapitulatif de la période' },
            ]}
            className="mb-4 sm:max-w-md"
          />
          {view === 'recap' && cls ? (
            <Recap cls={cls} period={period} />
          ) : list.length === 0 ? (
            <Empty icon={<GraduationCap size={22} />} title={`Aucune évaluation en ${PERIOD_BY_ID[period].label}`} action={<Button onClick={() => setEditing('new')}>Saisir des notes</Button>}>
              Créez une évaluation puis saisissez la note de chaque élève.
            </Empty>
          ) : (
            <Table head={['Date', 'Branche', 'Évaluation', 'Moyenne', 'Notés', '']}>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{formatShort(e.date)}</td>
                  <td>
                    <Badge tone="info">{e.subjectName}</Badge>
                  </td>
                  <td>
                    <div className="font-semibold">{e.title}</div>
                    <div className="text-xs text-ink-3">
                      sur {fmt(e.max)} · {e.teacherName}
                    </div>
                  </td>
                  <td className="font-semibold whitespace-nowrap">
                    {e.count ? (
                      <span className={cx(e.average < e.max / 2 && 'text-danger-ink')}>
                        {fmt(e.average)} / {fmt(e.max)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{e.count}</td>
                  <td className="text-right whitespace-nowrap">
                    {canEdit(e) && (
                      <>
                        <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditing(e)}>
                          Notes
                        </Button>
                        <ConfirmAction
                          label="Supprimer"
                          title="Supprimer cette évaluation ?"
                          message={`« ${e.title} » et toutes ses notes seront supprimées. Les parents ne les verront plus.`}
                          onConfirm={() => deleteEvaluation(db, e)}
                        />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
      {editing && cls && <EvaluationForm cls={cls} evaluation={editing === 'new' ? null : editing} defaultPeriod={period} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ── Saisie des notes ───────────────────────────────────────────────────────

function EvaluationForm({ cls, evaluation, defaultPeriod, onClose }: { cls: ClassRoom; evaluation: Evaluation | null; defaultPeriod: PeriodId; onClose: () => void }) {
  const { db } = getFirebase();
  const access = useAccess();
  const { schoolId, students, year } = useSchool();
  const { busy, run } = useAction();
  const subjects = cls.subjects ?? [];
  const [subjectId, setSubjectId] = useState(evaluation?.subjectId ?? subjects[0]?.id ?? '');
  const [title, setTitle] = useState(evaluation?.title ?? '');
  const [date, setDate] = useState(evaluation?.date ?? todayISO());
  const [period, setPeriod] = useState<PeriodId>(evaluation?.period ?? defaultPeriod);
  const [max, setMax] = useState(evaluation ? String(evaluation.max) : '');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const subject = subjects.find((s) => s.id === subjectId);
  const classStudents = students.filter((s) => s.active && s.classId === cls.id);

  // Évaluation existante : on recharge les notes déjà saisies.
  const existing = useLiveQuery<Grade>(evaluation ? `eval-grades:${evaluation.id}` : null, () => q.evaluationGrades(db, schoolId, evaluation!.id));
  const previous = useMemo(() => Object.fromEntries(existing.data.map((g) => [g.studentId, g.score])), [existing.data]);
  const loadedKey = existing.loading ? '' : existing.data.map((g) => `${g.studentId}:${g.score}`).join('|');
  useEffect(() => {
    if (!evaluation || existing.loading) return;
    setScores(Object.fromEntries(existing.data.filter((g) => g.score !== null).map((g) => [g.studentId, String(g.score)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  // Maximum proposé : celui de la branche (ou de l'examen) tant que l'enseignant ne l'a pas changé.
  const suggestedMax = subject ? periodMax(subject, period) : 20;
  const maxValue = Number((max || String(suggestedMax)).replace(',', '.'));
  const parsed = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Number(v.replace(',', '.')));
  const values = classStudents.map((s) => parsed(scores[s.id]));
  const invalid = values.some((v) => v !== null && (Number.isNaN(v) || v < 0 || v > maxValue));
  const avg = averageScore(values);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subject) return setError('Choisissez une branche.');
    if (!(maxValue > 0)) return setError('Indiquez la note maximale.');
    if (invalid) return setError(`Certaines notes ne sont pas comprises entre 0 et ${fmt(maxValue)}.`);
    const id = await run(
      () =>
        saveEvaluation(db, {
          id: evaluation?.id,
          createdAt: evaluation?.createdAt,
          evaluation: {
            schoolId,
            classId: cls.id,
            className: cls.name,
            subjectId: subject.id,
            subjectName: subject.name,
            year: evaluation?.year ?? year,
            period,
            title: title.trim() || (PERIOD_BY_ID[period].exam ? 'Examen' : 'Interrogation'),
            date,
            max: maxValue,
            teacherName: evaluation?.teacherName ?? access.name,
            createdBy: evaluation?.createdBy ?? access.email,
          },
          scores: Object.fromEntries(classStudents.map((s, i) => [s.id, values[i]])),
          previous: evaluation ? previous : undefined,
        }),
      evaluation ? 'Notes mises à jour.' : 'Notes enregistrées : les parents sont prévenus.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title={evaluation ? `Notes · ${evaluation.title}` : `Nouvelle évaluation · ${cls.name}`} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Branche" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Période" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </SelectField>
          <Field label="Intitulé" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Interrogation n° 2" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
            <Field label="Sur" inputMode="decimal" value={max} placeholder={String(suggestedMax)} onChange={(e) => setMax(e.target.value)} />
          </div>
        </div>

        <div className="rounded-[16px] border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ground/60 px-4 py-2.5 text-sm">
            <span className="font-bold">
              {classStudents.length} élève{classStudents.length > 1 ? 's' : ''} · laissez vide pour un absent
            </span>
            <span className="text-ink-2">
              Moyenne : <strong>{avg === null ? '—' : `${fmt(avg)} / ${fmt(maxValue)}`}</strong>
            </span>
          </div>
          {existing.loading && evaluation ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">Chargement des notes…</p>
          ) : (
            <ul className="max-h-[50vh] divide-y divide-line-soft overflow-y-auto">
              {classStudents.map((s, i) => {
                const v = values[i];
                const bad = v !== null && (Number.isNaN(v) || v < 0 || v > maxValue);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-6 text-right text-sm text-ink-3">{i + 1}</span>
                    <label htmlFor={`score-${s.id}`} className="flex-1 font-semibold">
                      {fullName(s)}
                    </label>
                    <input
                      id={`score-${s.id}`}
                      inputMode="decimal"
                      value={scores[s.id] ?? ''}
                      onChange={(e) => setScores((x) => ({ ...x, [s.id]: e.target.value }))}
                      aria-invalid={bad}
                      className={cx(
                        'h-11 w-20 rounded-lg border bg-surface px-2 text-center text-[16px] font-bold',
                        bad ? 'border-danger text-danger-ink' : 'border-[#c4ccc6]',
                        v !== null && !bad && v < maxValue / 2 && 'text-danger-ink',
                      )}
                    />
                    <span className="w-12 text-sm text-ink-3">/ {fmt(maxValue)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy} disabled={!classStudents.length}>
            Enregistrer les notes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Récapitulatif de la période ────────────────────────────────────────────

function Recap({ cls, period }: { cls: ClassRoom; period: PeriodId }) {
  const { db } = getFirebase();
  const { schoolId, students, year } = useSchool();
  const grades = useLiveQuery<Grade>(`class-grades:${cls.id}:${year}`, () => q.classGradesOfYear(db, schoolId, cls.id, year));
  const subjects = cls.subjects ?? [];
  const classStudents = students.filter((s) => s.active && s.classId === cls.id);
  const byStudent = useMemo(() => {
    const m = new Map<string, Grade[]>();
    for (const g of grades.data) m.set(g.studentId, [...(m.get(g.studentId) ?? []), g]);
    return m;
  }, [grades.data]);

  const rows = classStudents.map((s) => {
    const gs = byStudent.get(s.id) ?? [];
    return { s, points: subjects.map((sub) => subjectPeriodPoints(gs, sub, period)), percent: runningPercent(gs, period) };
  });

  function exportCsv() {
    downloadCsv(`notes-${cls.name}-${period}.csv`, [
      ['Élève', ...subjects.map((s) => `${s.name} /${periodMax(s, period)}`), '%'],
      ...rows.map((r) => [fullName(r.s), ...r.points.map((p) => (p === null ? '' : p)), r.percent ?? '']),
    ]);
  }

  if (grades.loading) return <p className="py-6 text-center text-sm text-ink-3">Chargement…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">Points de chaque branche ramenés à son maximum. Le pourcentage reste provisoire jusqu'au bulletin.</p>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          Exporter (Excel)
        </Button>
      </div>
      <Table head={['Élève', ...subjects.map((s) => `${s.name} /${periodMax(s, period)}`), '%']}>
        {rows.map((r) => (
          <tr key={r.s.id}>
            <td className="font-semibold whitespace-nowrap">{fullName(r.s)}</td>
            {r.points.map((p, i) => (
              <td key={subjects[i].id} className={cx('text-center', p !== null && p < periodMax(subjects[i], period) / 2 && 'font-bold text-danger-ink')}>
                {p === null ? '—' : fmt(p)}
              </td>
            ))}
            <td className="font-bold whitespace-nowrap">{r.percent === null ? '—' : formatPercent(r.percent)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
