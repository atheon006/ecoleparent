import { isValidPhone, normalizeMatricule } from '@pe/shared';
import { errorMessage, linkChild } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { Button, ErrorNote, Field, IconButton, useToast } from '@pe/shared/ui';
import { ArrowLeft, LogOut, QrCode } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { matriculeFromQr, QrScanner } from '../components/QrScanner';
import { nativeGoogleSignOut } from '../native';
import { useParentData } from '../data';

export function AddChild({ first, onDone, onCancel }: { first?: boolean; onDone: () => void; onCancel?: () => void }) {
  const { user, signOut } = useAuth();
  const { setActiveId } = useParentData();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const onScan = useCallback((text: string) => {
    setCode(normalizeMatricule(matriculeFromQr(text)));
    setScanning(false);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(phone)) {
      setError('Numéro de téléphone incomplet : il faut au moins 9 chiffres.');
      return;
    }
    setBusy(true);
    try {
      const link = await linkChild(getFirebase().db, {
        uid: user!.uid,
        email: user!.email ?? '',
        name: user!.displayName ?? '',
        code,
        phone,
      });
      setActiveId(link.studentId);
      toast('Enfant ajouté.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-ground">
      <header className="flex items-center justify-between px-3 pt-safe-3">
        {onCancel ? (
          <IconButton label="Retour" onClick={onCancel}>
            <ArrowLeft size={24} aria-hidden="true" />
          </IconButton>
        ) : (
          <span />
        )}
        {first && (
          <Button variant="ghost" size="sm" icon={<LogOut size={16} aria-hidden="true" />} onClick={() => void nativeGoogleSignOut().then(signOut)}>
            Déconnexion
          </Button>
        )}
      </header>

      <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex flex-1 flex-col gap-5 px-6 pt-2 pb-6">
          <div className="flex flex-col gap-2">
            {first && <span className="text-[13px] font-bold tracking-wider text-brand uppercase">Dernière étape</span>}
            <h1 className="font-display text-[30px] leading-tight font-extrabold">Ajoutez votre enfant</h1>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Le code élève figure sur la fiche remise par l'école et sur chaque reçu de paiement.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex min-h-[72px] w-full items-center gap-3.5 rounded-[18px] border border-line bg-surface p-4 text-left"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <QrCode size={22} aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-bold">Scanner le QR code</span>
              <span className="text-[13px] text-ink-3">Le plus rapide, sans rien taper</span>
            </span>
          </button>

          <div className="flex items-center gap-3 text-[13px] text-ink-3">
            <span className="h-px flex-1 bg-line" />
            ou saisissez-le
            <span className="h-px flex-1 bg-line" />
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Field
            label="Code élève"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={() => setCode((c) => normalizeMatricule(c))}
            placeholder="PE-CSH-2026-XXXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="text-[17px] tracking-wider"
            required
          />
          <Field
            label="Votre numéro de téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+243 8X XXX XXXX"
            hint="Celui que vous avez donné à l'école. Il confirme que vous êtes bien le parent."
            className="text-[17px]"
            required
          />
        </div>

        <div className="sticky bottom-0 bg-ground px-6 pt-3 pb-safe-6">
          <Button type="submit" size="lg" block loading={busy}>
            Ajouter l'enfant
          </Button>
        </div>
      </form>

      <QrScanner open={scanning} onClose={() => setScanning(false)} onResult={onScan} />
    </div>
  );
}
