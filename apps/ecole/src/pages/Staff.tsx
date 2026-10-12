import { STAFF_ROLE_LABELS, type Member, type StaffRole } from '@pe/shared';
import { deleteMember, saveMember, setMemberActive } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Badge, Button, Checkbox, ErrorNote, Field, Modal, SelectField } from '@pe/shared/ui';
import { Pencil, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAccess } from '../access';
import { ConfirmAction, PageHeader, Table, useAction } from '../components/common';
import { useSchool } from '../school';

const ROLE_HELP: Record<StaffRole, string> = {
  admin: 'Accès complet : élèves, personnel, frais, caisse, communiqués.',
  surveillant: "Appel de toutes les classes, justifications, conduite.",
  professeur: 'Appel et devoirs de ses classes, conduite.',
  caissier: 'Encaissements, reçus, recouvrement.',
};

export function StaffPage() {
  const { db } = getFirebase();
  const access = useAccess();
  const { members, classById } = useSchool();
  const { run } = useAction();
  const [editing, setEditing] = useState<Member | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title="Personnel"
        description="Chaque membre se connecte au site de l'école avec l'adresse e-mail enregistrée ici (compte Google ou mot de passe)."
        actions={
          <Button icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => setEditing('new')}>
            Ajouter un membre
          </Button>
        }
      />
      <Table head={['Nom', 'Fonction', 'Classes', 'Statut', '']}>
        {members.map((m) => (
          <tr key={m.email}>
            <td>
              <div className="font-semibold">{m.name}</div>
              <div className="text-xs text-ink-3">
                {m.email}
                {m.phone ? ` · ${m.phone}` : ''}
              </div>
            </td>
            <td>{STAFF_ROLE_LABELS[m.role]}</td>
            <td className="max-w-56 text-[13px] text-ink-2">
              {m.classIds.map((id) => classById.get(id)?.name).filter(Boolean).join(', ') || '—'}
            </td>
            <td>{m.active ? <Badge tone="brand">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}</td>
            <td className="text-right whitespace-nowrap">
              <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditing(m)}>
                Modifier
              </Button>
              {m.email !== access.email && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => void run(() => setMemberActive(db, m.email, !m.active), m.active ? 'Accès désactivé.' : 'Accès réactivé.')}>
                    {m.active ? 'Désactiver' : 'Réactiver'}
                  </Button>
                  <ConfirmAction
                    label="Retirer"
                    title="Retirer ce membre ?"
                    message={`${m.name} n'aura plus accès au site de l'école.`}
                    onConfirm={() => deleteMember(db, m.email)}
                  />
                </>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {editing && <MemberForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberForm({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId, classes } = useSchool();
  const { busy, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(member?.email ?? '');
  const [name, setName] = useState(member?.name ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'professeur');
  const [classIds, setClassIds] = useState<string[]>(member?.classIds ?? []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === 'professeur' && classIds.length === 0) {
      setError("Cochez au moins une classe : un professeur ne voit que les classes qui lui sont attribuées.");
      return;
    }
    const ok = await run(async () => {
      await saveMember(db, { email, schoolId, role, name, phone, classIds }, member ?? undefined);
      return true;
    }, member ? 'Fiche modifiée.' : 'Membre ajouté.');
    if (ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title={member ? `Modifier · ${member.name}` : 'Ajouter un membre'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom complet" value={name} onChange={(e) => setName(e.target.value)} required />
          <Field
            label="Adresse e-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!member}
            hint={member ? "L'adresse ne peut pas être changée : retirez le membre et ajoutez-le à nouveau." : 'Adresse de connexion de la personne.'}
            required
          />
          <Field label="Téléphone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <SelectField label="Fonction" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} hint={ROLE_HELP[role]}>
            {(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </SelectField>
        </div>
        {(role === 'professeur' || role === 'surveillant') && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">Classes {role === 'surveillant' ? '(facultatif)' : ''}</legend>
            <div className="grid gap-x-4 sm:grid-cols-3">
              {classes.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={classIds.includes(c.id)}
                  onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))}
                />
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
