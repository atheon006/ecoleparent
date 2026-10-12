import { formatFull, type School } from '@pe/shared';
import { createSchool, q, setSchoolActive } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, Modal, SelectField } from '@pe/shared/ui';
import { ChevronRight, LogOut, Plus, School as SchoolIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader, useAction } from '../components/common';

export function SuperSchools({ onOpen }: { onOpen: (id: string) => void }) {
  const { db } = getFirebase();
  const { signOut, user } = useAuth();
  const schools = useLiveQuery<School>('schools', () => q.schools(db));
  const [creating, setCreating] = useState(false);
  const { run } = useAction();
  const list = [...schools.data].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink-3">Super-administrateur · {user?.email}</span>
        <Button variant="ghost" size="sm" icon={<LogOut size={16} aria-hidden="true" />} onClick={() => void signOut()}>
          Déconnexion
        </Button>
      </div>
      <PageHeader
        title="Écoles"
        description="Créez une école et son compte directeur. Le directeur se connecte ensuite avec l'adresse e-mail indiquée."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            Nouvelle école
          </Button>
        }
      />
      {schools.loading ? (
        <Loading />
      ) : schools.error ? (
        <AccessError onSignOut={() => void signOut()} />
      ) : list.length === 0 ? (
        <Empty icon={<SchoolIcon size={22} />} title="Aucune école" action={<Button onClick={() => setCreating(true)}>Créer la première école</Button>}>
          Commencez par créer une école et désigner son directeur.
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((s) => (
            <Card as="li" key={s.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold">{s.name}</span>
                  <span className="text-sm text-ink-3">{s.address}</span>
                  <span className="text-sm text-ink-2">Directeur : {s.adminEmail}</span>
                  <span className="text-xs text-ink-3">
                    Créée le {formatFull(s.createdAt.slice(0, 10))} · préfixe {s.codePrefix} · {s.currency}
                  </span>
                </div>
                {s.active ? <Badge tone="brand">Active</Badge> : <Badge tone="danger">Suspendue</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onOpen(s.id)} icon={<ChevronRight size={16} aria-hidden="true" />}>
                  Ouvrir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(() => setSchoolActive(db, s.id, !s.active), s.active ? 'École suspendue.' : 'École réactivée.')}
                >
                  {s.active ? 'Suspendre' : 'Réactiver'}
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
      <CreateSchool open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateSchool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = getFirebase();
  const { busy, run } = useAction();
  const [form, setForm] = useState({ name: '', address: '', phone: '', currency: '$', adminEmail: '', adminName: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = await run(() => createSchool(db, form), 'École créée.');
    if (id) {
      setForm({ name: '', address: '', phone: '', currency: '$', adminEmail: '', adminName: '' });
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle école">
      <form id="create-school" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom de l'école" value={form.name} onChange={set('name')} placeholder="Complexe Scolaire Horizon" required />
        <Field label="Adresse" value={form.address} onChange={set('address')} placeholder="Av. de la Paix N° 45, Gombe" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone" type="tel" value={form.phone} onChange={set('phone')} />
          <SelectField label="Monnaie" value={form.currency} onChange={set('currency')}>
            <option value="$">Dollar ($)</option>
            <option value="FC">Franc congolais (FC)</option>
          </SelectField>
        </div>
        <div className="mt-2 border-t border-line-soft pt-4">
          <h3 className="mb-3 text-base font-semibold">Directeur</h3>
          <div className="flex flex-col gap-4">
            <Field label="Nom du directeur" value={form.adminName} onChange={set('adminName')} required />
            <Field
              label="E-mail du directeur"
              type="email"
              value={form.adminEmail}
              onChange={set('adminEmail')}
              hint="Il se connectera avec ce compte Google, ou en créant un mot de passe pour cette adresse."
              required
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Créer l'école
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Lecture refusée ou impossible : on le dit, au lieu d'afficher une liste vide. */
export function AccessError({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorNote>
        Impossible de charger les données : l'accès a été refusé ou la connexion a échoué. Rechargez la page ; si le problème continue,
        déconnectez-vous puis reconnectez-vous avec votre code de vérification.
      </ErrorNote>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recharger
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
