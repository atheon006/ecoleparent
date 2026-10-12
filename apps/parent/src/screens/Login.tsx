import { errorMessage } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { Button, ErrorNote, Field, Segmented } from '@pe/shared/ui';
import { useState, type FormEvent } from 'react';
import illustration from '../assets/illustrations/notifications.svg';
import { GoogleLogo, Icon, type IconName } from '../components/Icon';
import { googleSignInAvailable, isNative, nativeGoogleIdToken } from '../native';

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
    <div className="h-full overflow-y-auto bg-surface lg:grid lg:grid-cols-2 lg:overflow-hidden">
      <div className="flex flex-col items-center px-6 pt-safe-10 text-center lg:justify-center lg:border-r lg:border-line lg:bg-ground lg:px-14">
        <img src={illustration} alt="Un parent reçoit sur son téléphone les nouvelles de l'école" className="h-44 w-auto max-w-full lg:h-72" />
        <div className="mt-6 text-[26px] font-bold tracking-tight">
          Parent<span className="text-brand">Ecole</span>
        </div>
        <p className="mt-1 text-[15px] text-ink-2">La scolarité de vos enfants, au jour le jour.</p>
        <ul className="mt-6 hidden max-w-sm flex-col gap-2.5 text-left text-[15px] text-ink-2 lg:flex">
          {[
            ['calendar-check', "Présence ou absence, chaque matin après l'appel"],
            ['chart-line-up', 'Notes, bulletins et devoirs dès leur publication'],
            ['wallet', 'Frais payés, reste à payer et reçus'],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-center gap-3">
              <Icon name={icon as IconName} size={20} className="text-ink-3" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-6 pt-7 pb-safe-8 lg:flex lg:items-center lg:overflow-y-auto lg:px-12 lg:py-10">
        <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-4">
          {googleSignInAvailable && mode !== 'reset' && (
            <>
              <Button
                variant="secondary"
                size="lg"
                block
                loading={googleBusy}
                onClick={() => void google()}
                icon={<GoogleLogo size={20} />}
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
            <h2 className="text-xl font-semibold">Mot de passe oublié</h2>
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
            <button type="button" className="min-h-11 text-sm font-semibold text-brand" onClick={() => setMode('reset')}>
              Mot de passe oublié ?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="min-h-11 text-sm font-semibold text-brand" onClick={() => setMode('signin')}>
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

