import { ANNOUNCEMENT_CATEGORIES, formatShort, type Acknowledgement, type Announcement, type AnnouncementCategory } from '@pe/shared';
import { deleteAnnouncement, publishAnnouncement, q } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveMany, useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Checkbox, Empty, Field, Modal, SelectField, TextArea } from '@pe/shared/ui';
import { CheckCheck, Megaphone, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmAction, PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

const tone = { Général: 'brand', Urgent: 'danger', Pédagogique: 'info', Financier: 'warn', Congés: 'neutral' } as const;

export function AnnouncementsPage() {
  const { db } = getFirebase();
  const { schoolId, classById } = useSchool();
  const list = useLiveQuery<Announcement>(`ann:${schoolId}`, () => q.announcements(db, schoolId));
  const [adding, setAdding] = useState(false);
  const [acksOf, setAcksOf] = useState<Announcement | null>(null);
  const important = list.data.filter((a) => a.important);
  const acks = useLiveMany<Acknowledgement>(important.map((a) => ({ key: `acks:${a.id}`, make: () => q.announcementAcks(db, schoolId, a.id) })));

  return (
    <div>
      <PageHeader
        title="Communiqués"
        description="Publiés aussitôt dans l'application des parents, pour toute l'école ou pour certaines classes."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Nouveau communiqué
          </Button>
        }
      />
      {list.data.length === 0 ? (
        <Empty icon={<Megaphone size={22} />} title="Aucun communiqué" />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.data.map((a) => (
            <Card as="li" key={a.id} className="flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone[a.category]}>{a.category}</Badge>
                {a.important && <Badge tone="solid">Lecture à confirmer</Badge>}
                <Badge tone="neutral">{a.classIds.length ? a.classIds.map((id) => classById.get(id)?.name ?? '?').join(', ') : 'Toute l’école'}</Badge>
                <span className="text-[13px] text-ink-3">
                  {formatShort(a.publishedAt.slice(0, 10))} · {a.author}
                </span>
              </div>
              <span className="font-display text-lg font-bold">{a.title}</span>
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{a.content}</p>
              <div className="flex flex-wrap items-center gap-1">
                {a.important && (
                  <Button size="sm" variant="secondary" icon={<CheckCheck size={14} aria-hidden="true" />} onClick={() => setAcksOf(a)}>
                    Lu et confirmé par {acks.data[`acks:${a.id}`]?.length ?? 0} parent{(acks.data[`acks:${a.id}`]?.length ?? 0) > 1 ? 's' : ''}
                  </Button>
                )}
                <ConfirmAction label="Supprimer" title="Supprimer ce communiqué ?" message="Il disparaîtra de l'application des parents." onConfirm={() => deleteAnnouncement(db, schoolId, a.id)} />
              </div>
            </Card>
          ))}
        </ul>
      )}
      {adding && <AnnouncementForm onClose={() => setAdding(false)} />}
      {acksOf && (
        <Modal open onClose={() => setAcksOf(null)} title={`Confirmations · ${acksOf.title}`}>
          {(acks.data[`acks:${acksOf.id}`] ?? []).length === 0 ? (
            <p className="text-[15px] text-ink-2">Aucun parent n'a encore confirmé la lecture.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {[...(acks.data[`acks:${acksOf.id}`] ?? [])]
                .sort((x, y) => x.at.localeCompare(y.at))
                .map((k) => (
                  <li key={k.uid} className="flex justify-between gap-3 py-2 text-[15px]">
                    <span className="font-semibold">{k.name}</span>
                    <span className="text-sm text-ink-3">{formatShort(k.at.slice(0, 10))}</span>
                  </li>
                ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function AnnouncementForm({ onClose }: { onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId, classes, school } = useSchool();
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('Général');
  const [author, setAuthor] = useState('Direction');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [important, setImportant] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = await run(() => publishAnnouncement(db, { schoolId, title: title.trim(), content: content.trim(), category, classIds, important: important || undefined, author: author.trim() || school?.name || 'Direction' }), 'Communiqué publié.');
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Nouveau communiqué" wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}>
            {ANNOUNCEMENT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Field label="Signé par" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextArea label="Message" rows={6} value={content} onChange={(e) => setContent(e.target.value)} required />
        <fieldset>
          <legend className="mb-1 text-sm font-bold">Classes concernées (aucune cochée = toute l'école)</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            {classes.map((c) => (
              <Checkbox key={c.id} label={c.name} checked={classIds.includes(c.id)} onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))} />
            ))}
          </div>
        </fieldset>
        <Checkbox
          label="Demander aux parents de confirmer la lecture"
          hint="Pour les informations importantes : vous voyez qui a lu et confirmé."
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
        />
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
