import { CONDUCT_TYPES, formatShort, todayISO, type Conduct, type ConductType, type Student } from '@pe/shared';

/** Points d'une note (ceux du type si la note n'en précise pas). */
const pointsOf = (c: Conduct) => c.points ?? CONDUCT_TYPES.find((t) => t.type === c.type)?.points ?? 0;
import { addConduct, deleteConduct, q } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Empty, Field, Modal, SelectField, TextArea, cx } from '@pe/shared/ui';
import { Award, Plus, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAccess, useRole } from '../access';
import { ConfirmAction, PageHeader, SearchBox, Table, useAction } from '../components/common';
import { fullName, matchStudent, useSchool } from '../school';

const toneOf = { positive: 'brand', info: 'info', warning: 'warn', danger: 'danger' } as const;

export function ConductPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { schoolId, myClasses } = useSchool();
  const reports = useLiveQuery<Conduct>(`conduct:${schoolId}`, () => q.schoolConduct(db, schoolId));
  const [adding, setAdding] = useState(false);
  const mine = new Set(myClasses.map((c) => c.id));
  const list = reports.data.filter((c) => role !== 'professeur' || mine.has(c.classId));
  // Tableau d'honneur : total des points du mois en cours.
  const month = todayISO().slice(0, 7);
  const totals = new Map<string, { name: string; points: number }>();
  for (const c of list.filter((x) => x.date.startsWith(month))) {
    const t = totals.get(c.studentId) ?? { name: c.studentName, points: 0 };
    t.points += pointsOf(c);
    totals.set(c.studentId, t);
  }
  const honor = [...totals.values()].filter((t) => t.points > 0).sort((a, b) => b.points - a.points).slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Conduite"
        description="Félicitations, observations et avertissements. Les parents les voient dans l'application."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Nouvelle note
          </Button>
        }
      />
      {honor.length > 0 && (
        <section className="mb-5 rounded-[14px] border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <Trophy size={18} className="text-ink-3" aria-hidden="true" /> Tableau d'honneur du mois
          </h2>
          <ol className="flex flex-wrap gap-2">
            {honor.map((t, i) => (
              <li key={t.name + i} className="flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-sm">
                <strong>{i + 1}.</strong> {t.name} <span className="font-semibold text-brand">+{t.points}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {list.length === 0 ? (
        <Empty icon={<Award size={22} />} title="Aucune note de conduite" />
      ) : (
        <Table head={['Date', 'Élève', 'Type', 'Note', 'Points', 'Auteur', '']}>
          {list.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap">{formatShort(c.date)}</td>
              <td className="font-semibold">{c.studentName}</td>
              <td>
                <Badge tone={toneOf[c.severity]}>{c.type}</Badge>
              </td>
              <td>
                <div className="font-semibold">{c.title}</div>
                {c.comment && <div className="text-[13px] text-ink-3">{c.comment}</div>}
              </td>
              <td className={pointsOf(c) > 0 ? 'font-semibold text-brand' : pointsOf(c) < 0 ? 'font-semibold text-danger-ink' : 'text-ink-3'}>
                {pointsOf(c) > 0 ? `+${pointsOf(c)}` : pointsOf(c)}
              </td>
              <td className="text-[13px]">{c.author}</td>
              <td className="text-right">
                {(role === 'admin' || c.createdBy === access.email) && (
                  <ConfirmAction label="Supprimer" title="Supprimer cette note ?" message="Elle ne sera plus visible par les parents." onConfirm={() => deleteConduct(db, c)} />
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <ConductForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function ConductForm({ onClose }: { onClose: () => void }) {
  const { db } = getFirebase();
  const access = useAccess();
  const { schoolId, students, myClasses } = useSchool();
  const { busy, run } = useAction();
  const [search, setSearch] = useState('');
  const [student, setStudent] = useState<Student | null>(null);
  const [type, setType] = useState<ConductType>('Félicitation');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayISO());
  const mine = new Set(myClasses.map((c) => c.id));
  const results = search.trim().length >= 2 ? students.filter((s) => s.active && mine.has(s.classId) && matchStudent(s, search)).slice(0, 6) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    const { severity, points } = CONDUCT_TYPES.find((t) => t.type === type)!;
    const id = await run(
      () =>
        addConduct(db, {
          studentId: student.id,
          schoolId,
          classId: student.classId,
          studentName: `${student.firstName} ${student.lastName}`,
          type,
          severity,
          points,
          title: title.trim(),
          comment: comment.trim(),
          date,
          author: access.name,
          createdBy: access.email,
        }),
      'Note enregistrée.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Nouvelle note de conduite">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {student ? (
          <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3.5 py-2.5">
            <span className="font-semibold">
              {fullName(student)} · {student.className}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setStudent(null)}>
              Changer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Élève</span>
            <SearchBox value={search} onChange={setSearch} placeholder="Tapez au moins 2 lettres du nom" />
            <ul className="flex flex-col gap-1">
              {results.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setStudent(s)} className={cx('w-full rounded-xl border border-line px-3 py-2 text-left hover:border-brand')}>
                    <span className="font-semibold">{fullName(s)}</span> <span className="text-sm text-ink-3">· {s.className}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as ConductType)}>
            {CONDUCT_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.type} ({t.points > 0 ? `+${t.points}` : t.points} pt{Math.abs(t.points) > 1 ? 's' : ''})
              </option>
            ))}
          </SelectField>
          <Field label="Date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Très bonne participation en mathématiques" required />
        <TextArea label="Commentaire (facultatif)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy} disabled={!student}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
