import { formatLongCap, todayISO, type Homework, type HomeworkSeen } from '@pe/shared';
import { addHomework, deleteHomework, q } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveMany, useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Empty, Field, Modal, SelectField, TextArea } from '@pe/shared/ui';
import { BookOpen, Plus, ScanText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAccess, useRole } from '../access';
import { ConfirmAction, PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

export function HomeworkPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { schoolId, myClasses, students } = useSchool();
  const [classId, setClassId] = useState('');
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const all = useLiveQuery<Homework>(`hw:${schoolId}`, () => q.homework(db, schoolId));
  const seen = useLiveMany<HomeworkSeen>(myClasses.map((c) => ({ key: `seen:${c.id}`, make: () => q.classHomeworkSeen(db, schoolId, c.id) })));
  const today = todayISO();
  const mine = new Set(myClasses.map((c) => c.id));
  const list = all.data
    .filter((h) => mine.has(h.classId) && (!classId || h.classId === classId) && (showPast || h.dueDate >= today))
    .sort((a, b) => (showPast ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate)));

  const seenCount = (h: Homework) => new Set((seen.data[`seen:${h.classId}`] ?? []).filter((x) => x.homeworkId === h.id).map((x) => x.studentId)).size;
  const classSize = (id: string) => students.filter((s) => s.active && s.classId === id).length;
  const canDelete = (h: Homework) => role === 'admin' || h.createdBy === access.email;

  return (
    <div>
      <PageHeader
        title="Devoirs"
        description="Les parents voient les devoirs dans l'application et peuvent les marquer comme vus, comme la signature du journal de classe."
        actions={
          <>
            <Button variant="secondary" icon={<ScanText size={17} aria-hidden="true" />} onClick={() => (window.location.hash = '/importer?type=quiz')} disabled={myClasses.length === 0}>
              Préparer une interrogation
            </Button>
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)} disabled={myClasses.length === 0}>
              Publier un devoir
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select aria-label="Filtrer par classe" value={classId} onChange={(e) => setClassId(e.target.value)} className="h-12 rounded-xl border border-field bg-surface px-3 sm:w-64">
          <option value="">Toutes mes classes</option>
          {myClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="size-4 accent-[#1e4a38]" />
          Inclure les devoirs passés
        </label>
      </div>
      {list.length === 0 ? (
        <Empty icon={<BookOpen size={22} />} title="Aucun devoir à venir">
          {myClasses.length === 0 ? 'Aucune classe ne vous est attribuée : demandez-le à la direction.' : 'Publiez un devoir pour vos élèves.'}
        </Empty>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((h) => {
            const n = seenCount(h);
            const total = classSize(h.classId);
            return (
              <Card as="li" key={h.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info" className="uppercase">
                    {h.subject}
                  </Badge>
                  <Badge tone="neutral">{h.className}</Badge>
                  <span className="text-[13px] text-ink-3">pour le {formatLongCap(h.dueDate)}</span>
                </div>
                <span className="text-[17px] font-semibold">{h.title}</span>
                {h.description && <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{h.description}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[13px] text-ink-3">
                    {h.teacherName} · vu par les parents de <strong className="text-ink">{n}</strong>/{total} élèves
                  </span>
                  {canDelete(h) && (
                    <ConfirmAction label="Supprimer" title="Supprimer ce devoir ?" message={`« ${h.title} » ne sera plus visible par les parents.`} onConfirm={() => deleteHomework(db, schoolId, h.id)} />
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      )}
      {adding && <HomeworkForm onClose={() => setAdding(false)} defaultClass={classId || myClasses[0]?.id} />}
    </div>
  );
}

function HomeworkForm({ onClose, defaultClass }: { onClose: () => void; defaultClass?: string }) {
  const { db } = getFirebase();
  const access = useAccess();
  const { schoolId, myClasses } = useSchool();
  const { busy, run } = useAction();
  const [classId, setClassId] = useState(defaultClass ?? '');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cls = myClasses.find((c) => c.id === classId);
    if (!cls) return;
    const id = await run(
      () =>
        addHomework(db, {
          schoolId,
          classId,
          className: cls.name,
          subject: subject.trim(),
          title: title.trim(),
          description: description.trim(),
          dueDate,
          teacherName: access.name,
          createdBy: access.email,
        }),
      'Devoir publié.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Publier un devoir">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <SelectField label="Classe" value={classId} onChange={(e) => setClassId(e.target.value)} required>
          {myClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Matière" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathématiques" required />
          <Field label="À rendre le" type="date" value={dueDate} min={todayISO()} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Équations du second degré" required />
        <TextArea label="Consignes" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Exercices 12, 14 et 18 de la page 45." />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Publier
          </Button>
        </div>
      </form>
    </Modal>
  );
}
