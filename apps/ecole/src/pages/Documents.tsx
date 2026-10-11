import { DOCUMENT_CATEGORIES, formatShort, type DocumentCategory, type SchoolDocument } from '@pe/shared';
import { deleteDocument, q, saveDocument } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Empty, ErrorNote, Field, Modal, SelectField } from '@pe/shared/ui';
import { ExternalLink, FolderOpen, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmAction, PageHeader, Table, useAction } from '../components/common';
import { useSchool } from '../school';

export function DocumentsPage() {
  const { db } = getFirebase();
  const { schoolId } = useSchool();
  const docs = useLiveQuery<SchoolDocument>(`docs:${schoolId}`, () => q.documents(db, schoolId));
  const [adding, setAdding] = useState(false);
  const list = [...docs.data].sort((a, b) => DOCUMENT_CATEGORIES.indexOf(a.category) - DOCUMENT_CATEGORIES.indexOf(b.category) || a.title.localeCompare(b.title, 'fr'));

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Règlement intérieur, liste des fournitures, calendrier, formulaires : les parents les ouvrent depuis l'application. Déposez le fichier sur Google Drive (partagé « tous les utilisateurs disposant du lien ») et collez le lien ici."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Ajouter un document
          </Button>
        }
      />
      {list.length === 0 ? (
        <Empty icon={<FolderOpen size={22} />} title="Aucun document" />
      ) : (
        <Table head={['Document', 'Catégorie', 'Ajouté le', '']}>
          {list.map((d) => (
            <tr key={d.id}>
              <td>
                <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                  {d.title} <ExternalLink size={14} aria-hidden="true" />
                </a>
              </td>
              <td>
                <Badge tone="neutral">{d.category}</Badge>
              </td>
              <td className="whitespace-nowrap">{formatShort(d.createdAt.slice(0, 10))}</td>
              <td className="text-right">
                <ConfirmAction label="Supprimer" title="Retirer ce document ?" message={`« ${d.title} » ne sera plus proposé aux parents.`} onConfirm={() => deleteDocument(db, schoolId, d.id)} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <DocumentForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function DocumentForm({ onClose }: { onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId } = useSchool();
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('Règlement');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^https:\/\/\S+$/.test(url.trim())) return setError('Le lien doit commencer par https://');
    const id = await run(() => saveDocument(db, { schoolId, title, url, category }), 'Document ajouté.');
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Ajouter un document">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Règlement intérieur 2026-2027" required />
        <Field label="Lien" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" required />
        <SelectField label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Ajouter
          </Button>
        </div>
      </form>
    </Modal>
  );
}
