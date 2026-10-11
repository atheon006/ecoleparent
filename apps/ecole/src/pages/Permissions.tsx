import { formatLongCap, formatMoney, formatShort, todayISO, type PermissionAnswer, type PermissionSlip } from '@pe/shared';
import { deletePermission, q, savePermission } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Checkbox, Empty, Field, Modal, TextArea, cx } from '@pe/shared/ui';
import { Plus, Signature } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAccess } from '../access';
import { ConfirmAction, PageHeader, downloadCsv, useAction } from '../components/common';
import { fullName, useSchool } from '../school';

export function PermissionsPage() {
  const { db } = getFirebase();
  const { schoolId, classById, currency } = useSchool();
  const list = useLiveQuery<PermissionSlip>(`perms:${schoolId}`, () => q.permissions(db, schoolId));
  const [editing, setEditing] = useState<PermissionSlip | 'new' | null>(null);
  const [answersOf, setAnswersOf] = useState<PermissionSlip | null>(null);
  const today = todayISO();

  return (
    <div>
      <PageHeader
        title="Autorisations de sortie"
        description="Excursions, visites, activités hors de l'école : chaque parent autorise ou refuse dans l'application, sans papier à signer."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')}>
            Nouvelle autorisation
          </Button>
        }
      />
      {list.data.length === 0 ? (
        <Empty icon={<Signature size={22} />} title="Aucune demande d'autorisation" />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.data.map((p) => (
            <Card as="li" key={p.id} className={cx('flex flex-col gap-2 p-4', p.date < today && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{formatLongCap(p.date)}{p.time ? ` · ${p.time}` : ''}</Badge>
                <Badge tone="neutral">{p.classIds.length ? p.classIds.map((id) => classById.get(id)?.name ?? '?').join(', ') : 'Toute l’école'}</Badge>
                {p.deadline >= today ? <Badge tone="warn">Réponse avant le {formatShort(p.deadline)}</Badge> : <Badge tone="neutral">Réponses closes</Badge>}
              </div>
              <span className="text-[17px] font-bold">{p.title}</span>
              {p.description && <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{p.description}</p>}
              {p.cost ? <span className="text-sm font-semibold">Participation : {formatMoney(p.cost, currency)}</span> : null}
              <div className="flex flex-wrap gap-1 pt-1">
                <Button size="sm" variant="secondary" onClick={() => setAnswersOf(p)}>
                  Réponses des parents
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  Modifier
                </Button>
                <ConfirmAction label="Supprimer" title="Supprimer cette autorisation ?" message="Elle disparaîtra de l'application des parents, avec les réponses." onConfirm={() => deletePermission(db, schoolId, p.id)} />
              </div>
            </Card>
          ))}
        </ul>
      )}
      {editing && <PermissionForm slip={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {answersOf && <Answers slip={answersOf} onClose={() => setAnswersOf(null)} />}
    </div>
  );
}

function Answers({ slip, onClose }: { slip: PermissionSlip; onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId, students } = useSchool();
  const answers = useLiveQuery<PermissionAnswer>(`perm-ans:${slip.id}`, () => q.permissionAnswers(db, schoolId, slip.id));
  const byStudent = new Map(answers.data.map((a) => [a.studentId, a]));
  const concerned = students.filter((s) => s.active && (!slip.classIds.length || slip.classIds.includes(s.classId)));
  const yes = concerned.filter((s) => byStudent.get(s.id)?.answer === 'yes').length;
  const no = concerned.filter((s) => byStudent.get(s.id)?.answer === 'no').length;

  function exportCsv() {
    downloadCsv(`autorisation-${slip.date}.csv`, [
      ['Élève', 'Classe', 'Réponse', 'Parent', 'Date'],
      ...concerned.map((s) => {
        const a = byStudent.get(s.id);
        return [fullName(s), s.className, a ? (a.answer === 'yes' ? 'Autorisé' : 'Refusé') : 'Sans réponse', a?.parentName ?? '', a ? a.at.slice(0, 10) : ''];
      }),
    ]);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={slip.title}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={exportCsv}>
            Exporter (Excel)
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{yes} autorisé{yes > 1 ? 's' : ''}</Badge>
          <Badge tone="danger">{no} refusé{no > 1 ? 's' : ''}</Badge>
          <Badge tone="neutral">{concerned.length - yes - no} sans réponse</Badge>
        </div>
        <ul className="divide-y divide-line-soft rounded-[16px] border border-line">
          {concerned.map((s) => {
            const a = byStudent.get(s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  <span className="font-semibold">{fullName(s)}</span> <span className="text-sm text-ink-3">· {s.className}</span>
                </span>
                {a ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-ink-3">{a.parentName}</span>
                    <Badge tone={a.answer === 'yes' ? 'brand' : 'danger'}>{a.answer === 'yes' ? 'Autorisé' : 'Refusé'}</Badge>
                  </span>
                ) : (
                  <Badge tone="neutral">Sans réponse</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

function PermissionForm({ slip, onClose }: { slip: PermissionSlip | null; onClose: () => void }) {
  const { db } = getFirebase();
  const access = useAccess();
  const { schoolId, classes, currency } = useSchool();
  const { busy, run } = useAction();
  const [title, setTitle] = useState(slip?.title ?? '');
  const [description, setDescription] = useState(slip?.description ?? '');
  const [date, setDate] = useState(slip?.date ?? '');
  const [time, setTime] = useState(slip?.time ?? '');
  const [deadline, setDeadline] = useState(slip?.deadline ?? '');
  const [cost, setCost] = useState(slip?.cost ? String(slip.cost) : '');
  const [classIds, setClassIds] = useState<string[]>(slip?.classIds ?? []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = await run(
      () =>
        savePermission(db, {
          id: slip?.id,
          createdAt: slip?.createdAt,
          schoolId,
          title: title.trim(),
          description: description.trim(),
          date,
          time: time || undefined,
          deadline: deadline || date,
          cost: Number(cost.replace(',', '.')) > 0 ? Number(cost.replace(',', '.')) : undefined,
          classIds,
          createdBy: slip?.createdBy ?? access.email,
        }),
      slip ? 'Autorisation modifiée.' : 'Demande envoyée aux parents.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title={slip ? "Modifier l'autorisation" : 'Nouvelle autorisation de sortie'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Activité" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Visite du parc des Virunga" required />
        <TextArea label="Détails pour les parents" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Départ de l'école à 8 h, retour vers 15 h. Prévoir un pique-nique." />
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date" type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} required />
          <Field label="Heure (facultatif)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <Field label="Répondre avant le" type="date" value={deadline} max={date || undefined} onChange={(e) => setDeadline(e.target.value)} />
          <Field label={`Participation (${currency})`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
        </div>
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
            {slip ? 'Enregistrer' : 'Envoyer aux parents'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
