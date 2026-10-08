import { errorMessage } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { Button, ErrorNote, Field, Segmented } from '@pe/shared/ui';
import { BookOpen, CalendarCheck, School, Wallet } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { googleSignInAvailable, isNative, nativeGoogleIdToken, setStatusBarOnDark } from '../native';

type Mode = 'signin' | 'signup' | 'reset';

const SITE_URL = import.meta.env.VITE_PARENT_URL || 'https://parentecole.web.app';

export function Login() {
  const { signIn, signUp, resetPassword, signInWithGoogle, signInWithGoogleIdToken } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void setStatusBarOnDark(true);
    return () => void setStatusBarOnDark(false);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Indiquez votre nom.');
        await signUp(name, email, password);
      } else {
        await resetPassword(email);
        setInfo('Un e-mail pour choisir un nouveau mot de passe vient de vous être envoyé.');
        setMode('signin');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const [googleBusy, setGoogleBusy] = useState(false);

  async function google() {
    setError(null);
    setGoogleBusy(true);
    try {
      if (isNative) {
        const idToken = await nativeGoogleIdToken();
        if (idToken) await signInWithGoogleIdToken(idToken);
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setError(googleErrorMessage(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-brand lg:grid lg:grid-cols-[1.1fr_1fr] lg:overflow-hidden">
      <div className="flex flex-col gap-6 px-7 pt-safe-12 pb-12 text-white lg:mx-auto lg:max-w-xl lg:justify-center lg:px-14">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-[14px] bg-chalk text-ink">
            <School size={26} aria-hidden="true" />
          </span>
          <span className="font-display text-[22px] font-bold">ParentEcole</span>
        </div>
        <h1 className="font-display text-[34px] leading-[1.08] font-extrabold lg:text-[46px]">L'école de vos enfants, dans votre poche.</h1>
        <ul className="flex flex-col gap-3">
          {[
            { icon: CalendarCheck, text: "Présence ou absence, chaque matin après l'appel" },
            { icon: Wallet, text: 'Frais payés, reste à payer et dates de renvoi' },
            { icon: BookOpen, text: "Devoirs, conduite et communiqués de l'école" },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-2">
                <Icon size={20} className="text-chalk" aria-hidden="true" />
              </span>
              <span className="text-[15px] leading-snug">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="-mt-6 min-h-[55%] rounded-t-[28px] bg-surface px-6 pt-6 pb-safe-8 lg:mt-0 lg:flex lg:min-h-0 lg:items-center lg:overflow-y-auto lg:rounded-none lg:px-12 lg:py-10">
        <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-4">
          {googleSignInAvailable && mode !== 'reset' && (
            <>
              <Button
                variant="secondary"
                size="lg"
                block
                loading={googleBusy}
                onClick={() => void google()}
                className="border-[#c4ccc6] text-ink"
                icon={<GoogleMark />}
              >
                Continuer avec Google
              </Button>
              <div className="flex items-center gap-3 text-[13px] text-ink-3">
                <span className="h-px flex-1 bg-line" />
                ou avec une adresse e-mail
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          {mode !== 'reset' ? (
            <Segmented
              label="Connexion ou inscription"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: 'signin', label: 'Se connecter' },
                { value: 'signup', label: 'Créer un compte' },
              ]}
            />
          ) : (
            <h2 className="font-display text-xl font-bold">Mot de passe oublié</h2>
          )}

          {info && <div className="rounded-xl bg-brand-soft px-3.5 py-3 text-sm font-semibold text-brand">{info}</div>}
          {error && <ErrorNote>{error}</ErrorNote>}

          {mode === 'signup' && (
            <Field label="Votre nom" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marie Kavira" required />
          )}
          <Field
            label="Adresse e-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            required
          />
          {mode !== 'reset' && (
            <Field
              label="Mot de passe"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              hint={mode === 'signup' ? '6 caractères minimum.' : undefined}
              required
            />
          )}

          <Button type="submit" size="lg" block loading={busy}>
            {mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Recevoir le lien'}
          </Button>

          {mode === 'signin' && (
            <button type="button" className="min-h-11 text-sm font-bold text-brand" onClick={() => setMode('reset')}>
              Mot de passe oublié ?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="min-h-11 text-sm font-bold text-brand" onClick={() => setMode('signin')}>
              Retour à la connexion
            </button>
          )}
          <p className="flex flex-wrap justify-center gap-x-4 pt-2 text-[13px] text-ink-3">
            <a href={`${SITE_URL}/confidentialite.html`} target="_blank" rel="noreferrer" className="underline">
              Politique de confidentialité
            </a>
            <a href={`${SITE_URL}/conditions.html`} target="_blank" rel="noreferrer" className="underline">
              Conditions d'utilisation
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

/**
 * Message d'échec de la connexion Google, avec le détail technique entre parenthèses :
 * sans lui, un refus de Google ou de Firebase ressemblait à « mot de passe incorrect ».
 */
function googleErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const raw = String((err as Error)?.message ?? err ?? '').replace(/^Firebase: /, '');
  if (code === 'auth/invalid-credential') return `Firebase a refusé le compte Google (${raw}). Réessayez ; si cela continue, prévenez l'école.`;
  if (code === 'auth/network-request-failed') return 'Pas de connexion internet. Réessayez.';
  if (code === 'auth/user-disabled') return errorMessage(err);
  if (/28444|developer console|10:|DEVELOPER_ERROR/i.test(raw)) return `Connexion Google non reconnue pour cette version de l'application (${raw}).`;
  if (/no credential|NoCredential|28433/i.test(raw)) return "Aucun compte Google sur ce téléphone. Ajoutez-en un dans les Paramètres, ou connectez-vous avec votre e-mail.";
  return raw ? `Connexion Google impossible : ${raw}` : errorMessage(err);
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}
