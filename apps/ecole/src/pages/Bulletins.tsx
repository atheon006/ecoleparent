import {
  BULLETIN_PERIODS,
  BULLETIN_PERIOD_BY_ID,
  MENTIONS,
  bulletinId,
  bulletinTotals,
  computeBulletinLines,
  formatFull,
  formatPercent,
  ordinal,
  rankByPercent,
  type Bulletin,
  type BulletinPeriod,
  type ClassRoom,
  type Grade,
  type Student,
} from '@pe/shared';
import { publishBulletins, q, unpublishBulletins } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Empty, ErrorNote, Field, Modal, SelectField, TextArea, cx } from '@pe/shared/ui';
import { FileText, Printer, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccess } from '../access';
import { ConfirmAction, PageHeader, StatTile, Table, useAction } from '../components/common';
import { fullName, useSchool } from '../school';
import { ClassPicker, guessPeriod } from './Grades';

type Extras = Pick<Bulletin, 'application' | 'conduct' | 'appreciation' | 'decision'>;

const DECISIONS = ['Admis(e) en classe supérieure', 'Admis(e) avec réserve', 'Ajourné(e) (seconde session)', 'Double la classe'];

/** Mention d'application proposée d'après le pourcentage (l'école peut la changer). */
function suggestedMention(percent: number): string {
  if (percent >= 80) return 'Élite';
  if (percent >= 70) return 'Très bien';
  if (percent >= 60) return 'Bien';
  if (percent >= 50) return 'Assez bien';
  if (percent >= 40) return 'Médiocre';
  return 'Mauvais';
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);

export function BulletinsPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const { schoolId, classes, students, year } = useSchool();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [period, setPeriod] = useState<BulletinPeriod>(guessPeriod);
  const [extras, setExtras] = useState<Record<string, Extras>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const { busy, run } = useAction();
  const cls = classes.find((c) => c.id === classId);
  const subjects = cls?.subjects ?? [];
  const grades = useLiveQuery<Grade>(classId ? `class-grades:${classId}:${year}` : null, () => q.classGradesOfYear(db, schoolId, classId, year));
  const published = useLiveQuery<Bulletin>(classId ? `class-bulletins:${classId}:${year}` : null, () => q.classBulletinsOfYear(db, schoolId, classId, year));
  const id = bulletinId(year, period);
  const publishedById = useMemo(() => new Map(published.data.filter((b) => b.id === id).map((b) => [b.studentId, b])), [published.data, id]);
  const classStudents = useMemo(() => students.filter((s) => s.active && s.classId === classId), [students, classId]);

  // Mentions et appréciations déjà publiées : point de départ du formulaire.
  const publishedKey = [...publishedById.values()].map((b) => `${b.studentId}:${b.publishedAt}`).join('|');
  useEffect(() => {
    setExtras(
      Object.fromEntries(
        [...publishedById.values()].map((b) => [b.studentId, { application: b.application, conduct: b.conduct, appreciation: b.appreciation, decision: b.decision }]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, id, publishedKey]);

  const computed = useMemo(() => {
    const byStudent = new Map<string, Grade[]>();
    for (const g of grades.data) byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g]);
    const rows = classStudents.map((s) => {
      const lines = computeBulletinLines(byStudent.get(s.id) ?? [], subjects, period);
      const totals = bulletinTotals(lines);
      const graded = lines.some((l) => l.points !== null);
      return { s, lines, ...totals, graded };
    });
    const ranks = rankByPercent(rows.map((r) => ({ id: r.s.id, percent: r.graded ? r.percent : null })));
    return rows.map((r) => ({ ...r, rank: ranks.get(r.s.id) ?? null })).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || fullName(a.s).localeCompare(fullName(b.s), 'fr'));
  }, [grades.data, classStudents, subjects, period]);

  const ranked = computed.filter((r) => r.graded);
  const classSize = ranked.length;

  function build(r: (typeof computed)[number]): Bulletin {
    const x = extras[r.s.id] ?? {};
    return {
      id,
      studentId: r.s.id,
      schoolId,
      classId,
      className: cls?.name ?? '',
      studentName: `${r.s.firstName} ${r.s.lastName}`,
      year,
      period,
      periodLabel: BULLETIN_PERIOD_BY_ID[period].label,
      lines: r.lines,
      totalMax: r.totalMax,
      totalPoints: r.totalPoints,
      percent: r.percent,
      rank: r.rank,
      classSize,
      application: x.application ?? suggestedMention(r.percent),
      conduct: x.conduct || undefined,
      appreciation: x.appreciation?.trim() || undefined,
      decision: x.decision?.trim() || undefined,
      publishedAt: new Date().toISOString(),
      publishedBy: access.name,
    };
  }

  async function publish() {
    const list = ranked.map(build);
    await run(() => publishBulletins(db, list), `${list.length} bulletin${list.length > 1 ? 's' : ''} publié${list.length > 1 ? 's' : ''} : les parents sont prévenus.`);
  }

  if (classes.length === 0) {
    return (
      <div>
        <PageHeader title="Bulletins" />
        <Empty icon={<FileText size={22} />} title="Aucune classe">
          Créez d'abord les classes et leurs branches.
        </Empty>
      </div>
    );
  }

  const average = ranked.length ? ranked.reduce((a, r) => a + r.percent, 0) / ranked.length : null;
  const success = ranked.filter((r) => r.percent >= 50).length;
  const viewingRow = computed.find((r) => r.s.id === viewing);
  const setExtra = (sid: string, patch: Extras) => setExtras((x) => ({ ...x, [sid]: { ...x[sid], ...patch } }));

  return (
    <div>
      <PageHeader
        title="Bulletins"
        description="Calculés à partir des notes saisies : points par branche, pourcentage et place. Ajoutez les mentions puis publiez : chaque parent reçoit le bulletin de son enfant."
        actions={
          <Button icon={<Send size={18} aria-hidden="true" />} onClick={() => void publish()} loading={busy} disabled={!ranked.length}>
            {publishedById.size ? 'Publier la mise à jour' : 'Publier les bulletins'}
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <ClassPicker classes={classes} value={classId} onChange={setClassId} />
        <SelectField label="Bulletin" value={period} onChange={(e) => setPeriod(e.target.value as BulletinPeriod)} wrapperClassName="sm:w-64">
          {BULLETIN_PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SelectField>
      </div>

      {!subjects.length ? (
        <ErrorNote>
          Indiquez d'abord les branches de cette classe dans{' '}
          <a href="#/classes" className="font-semibold underline">
            Classes
          </a>
          .
        </ErrorNote>
      ) : grades.loading ? (
        <p className="py-6 text-center text-sm text-ink-3">Chargement des notes…</p>
      ) : !ranked.length ? (
        <Empty icon={<FileText size={22} />} title="Aucune note pour ce bulletin">
          Les notes saisies dans la page Notes apparaissent ici automatiquement.
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatTile label="Moyenne de la classe" value={average === null ? '—' : formatPercent(Math.round(average * 10) / 10)} />
            <StatTile label="Réussite (50 % et plus)" value={`${success}/${ranked.length}`} tone={success < ranked.length / 2 ? 'warn' : 'brand'} />
            <StatTile
              label="Publiés"
              value={`${publishedById.size}/${ranked.length}`}
              sub={publishedById.size ? 'Republier met à jour les places et les mentions.' : 'Pas encore visibles par les parents.'}
              tone={publishedById.size ? 'brand' : 'info'}
            />
          </div>
          <Table head={['Place', 'Élève', 'Points', '%', 'Application', 'Conduite', '']}>
            {computed.map((r) => (
              <tr key={r.s.id} className={cx(!r.graded && 'opacity-60')}>
                <td className="text-base font-semibold">{r.rank ? ordinal(r.rank) : '—'}</td>
                <td>
                  <div className="font-semibold">{fullName(r.s)}</div>
                  {publishedById.has(r.s.id) ? <Badge tone="brand">Publié</Badge> : r.graded && <Badge tone="neutral">Non publié</Badge>}
                </td>
                <td className="whitespace-nowrap">
                  {r.graded ? `${fmt(r.totalPoints)} / ${fmt(r.totalMax)}` : '—'}
                </td>
                <td className={cx('font-semibold whitespace-nowrap', r.graded && r.percent < 50 && 'text-danger-ink')}>{r.graded ? formatPercent(r.percent) : '—'}</td>
                <td>
                  <MentionSelect label={`Application · ${r.s.firstName}`} value={extras[r.s.id]?.application ?? (r.graded ? suggestedMention(r.percent) : '')} onChange={(v) => setExtra(r.s.id, { application: v })} />
                </td>
                <td>
                  <MentionSelect label={`Conduite · ${r.s.firstName}`} value={extras[r.s.id]?.conduct ?? ''} onChange={(v) => setExtra(r.s.id, { conduct: v })} />
                </td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(r.s.id)} disabled={!r.graded}>
                    Voir
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          {publishedById.size > 0 && (
            <div className="mt-4">
              <ConfirmAction
                label="Retirer les bulletins publiés"
                title="Retirer ces bulletins ?"
                message={`Les ${publishedById.size} bulletins « ${BULLETIN_PERIOD_BY_ID[period].label} » de la classe ne seront plus visibles par les parents.`}
                onConfirm={() => unpublishBulletins(db, [...publishedById.values()])}
              />
            </div>
          )}
        </>
      )}
      {viewingRow && cls && (
        <BulletinModal
          bulletin={build(viewingRow)}
          student={viewingRow.s}
          cls={cls}
          extras={extras[viewingRow.s.id] ?? {}}
          onChange={(patch) => setExtra(viewingRow.s.id, patch)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function MentionSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border border-field bg-surface px-2 text-sm">
      <option value="">—</option>
      {MENTIONS.map((m) => (
        <option key={m}>{m}</option>
      ))}
    </select>
  );
}

// ── Bulletin d'un élève (aperçu imprimable) ────────────────────────────────

function BulletinModal({
  bulletin: b,
  student,
  cls,
  extras,
  onChange,
  onClose,
}: {
  bulletin: Bulletin;
  student: Student;
  cls: ClassRoom;
  extras: Extras;
  onChange: (patch: Extras) => void;
  onClose: () => void;
}) {
  const { school } = useSchool();
  const final = b.period === 'S2' || b.period === 'AN';
  return (
    <Modal
      open
      onClose={onClose}
      title={`Bulletin · ${student.firstName} ${student.lastName}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
            Imprimer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="print-area flex flex-col gap-4 rounded-[14px] border border-line p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {school?.logo && <img src={school.logo} alt="" className="size-14 rounded-xl object-contain" />}
              <div>
                <div className="text-base font-semibold">{school?.name}</div>
                {school?.address && <div className="text-xs text-ink-3">{school.address}</div>}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">Bulletin · {b.periodLabel}</div>
              <div className="text-ink-3">Année scolaire {b.year}</div>
            </div>
          </div>
          <div className="grid gap-1 rounded-xl bg-ground px-4 py-3 text-sm sm:grid-cols-3">
            <span>
              Élève : <strong>{fullName(student)}</strong>
            </span>
            <span>
              Classe : <strong>{cls.name}</strong>
            </span>
            <span>
              Matricule : <strong className="font-mono">{student.matricule}</strong>
            </span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-ink-3 uppercase">
                <th className="py-2">Branche</th>
                <th className="py-2 text-right">Maximum</th>
                <th className="py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.subjectId} className="border-b border-line-soft">
                  <td className="py-1.5">{l.subject}</td>
                  <td className="py-1.5 text-right text-ink-3">{fmt(l.max)}</td>
                  <td className={cx('py-1.5 text-right font-semibold', l.points !== null && l.points < l.max / 2 && 'text-danger-ink')}>{l.points === null ? '—' : fmt(l.points)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{fmt(b.totalMax)}</td>
                <td className="py-2 text-right">{fmt(b.totalPoints)}</td>
              </tr>
            </tbody>
          </table>
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <Cell label="Pourcentage" value={formatPercent(b.percent)} />
            <Cell label="Place" value={b.rank ? `${ordinal(b.rank)} sur ${b.classSize}` : '—'} />
            <Cell label="Application" value={b.application ?? '—'} />
            <Cell label="Conduite" value={b.conduct ?? '—'} />
          </div>
          {(b.appreciation || b.decision) && (
            <div className="text-sm">
              {b.appreciation && (
                <p>
                  <strong>Appréciation :</strong> {b.appreciation}
                </p>
              )}
              {b.decision && (
                <p>
                  <strong>Décision :</strong> {b.decision}
                </p>
              )}
            </div>
          )}
          <div className="flex justify-between pt-6 text-xs text-ink-3">
            <span>Fait le {formatFull(b.publishedAt.slice(0, 10))}</span>
            <span>{school?.directorName ? `${school.directorName}, chef d'établissement` : "Le chef d'établissement"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <TextArea label="Appréciation du titulaire" rows={2} value={extras.appreciation ?? ''} onChange={(e) => onChange({ appreciation: e.target.value })} placeholder="Bon trimestre, continue tes efforts en calcul." />
          {final && (
            <>
              <Field label="Décision de fin d'année" list="decisions" value={extras.decision ?? ''} onChange={(e) => onChange({ decision: e.target.value })} />
              <datalist id="decisions">
                {DECISIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </>
          )}
          <p className="text-sm text-ink-3">Ces ajouts sont envoyés aux parents à la prochaine publication.</p>
        </div>
      </div>
    </Modal>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ground px-3 py-2">
      <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
