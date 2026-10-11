import { errorMessage, saveUserProfile } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { ErrorNote, Field, useToast } from '@pe/shared/ui';
import { updateProfile } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { SubHeader } from '../components/ChildPicker';
import { Btn, List, Note, Row, Section, Tile } from '../components/kit';
import { nameInitials } from '../helpers';
import type { Nav } from '../nav';

export function Account({ nav }: { nav: Nav }) {
  const { user, refresh, resetPassword } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usesPassword = !!user?.providerData.some((p) => p.providerId === 'password');
  const usesGoogle = !!user?.providerData.some((p) => p.providerId === 'google.com');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(user, { displayName: name.trim() });
      await saveUserProfile(getFirebase().db, user.uid, { name: name.trim(), email: user.email ?? '' });
      await refresh();
      toast('Nom enregistré.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SubHeader title="Mon compte" onBack={nav.back} />
      <div className="flex justify-center pt-1 pb-3">
        <span className="tone-a flex size-[84px] items-center justify-center rounded-full font-display text-[28px] font-extrabold">{nameInitials(name || user?.email || 'P')}</span>
      </div>
      <form onSubmit={save} className="flex flex-col gap-3.5 px-[18px]">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Nom affiché" value={name} onChange={(e) => setName(e.target.value)} hint="L'école voit ce nom quand vous justifiez une absence ou signez une autorisation." required />
        <Field label="E-mail" value={user?.email ?? ''} readOnly disabled />
        <Btn type="submit" block icon="check" loading={busy} disabled={name.trim() === (user?.displayName ?? '')}>
          Enregistrer
        </Btn>
      </form>
      <Section title="Connexion" />
      <List>
        {usesGoogle && <Row left={<Tile icon="google-logo" tone="b" />} title="Compte Google" sub="Vous vous connectez avec Google" />}
        {usesPassword && (
          <Row
            left={<Tile icon="lock-key" tone="g" />}
            title="Changer le mot de passe"
            sub="Un lien vous est envoyé par e-mail"
            onClick={() =>
              void resetPassword(user!.email ?? '')
                .then(() => toast(`Lien envoyé à ${user!.email}.`))
                .catch((err) => toast(errorMessage(err), 'error'))
            }
          />
        )}
      </List>
      <Note icon="shield-check">Votre numéro de téléphone reste celui donné à l'école : pour le changer, faites une demande de correction depuis le profil de l'enfant.</Note>
    </div>
  );
}
