import { errorMessage } from '@pe/shared/api';
import { finishTotpEnrollment, startTotpEnrollment, useAuth } from '@pe/shared/auth';
import { CodeInput } from '@pe/shared/mfa';
import { Button, ErrorNote, Field, Loading, Segmented } from '@pe/shared/ui';
import type { TotpSecret } from 'firebase/auth';
import { School, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

const LEGAL_URL = import.meta.env.VITE_PARENT_URL || 'https://parentecole.web.app';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand md:flex-row">
      <div className="flex flex-col justify-between gap-8 p-8 text-white md:w-[44%] md:p-12">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[14px] bg-chalk text-ink">
            <School size={24} aria-hidden="true" />
          </span>
          <span className="font-display text-xl font-bold">ParentEcole</span>
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl leading-tight font-extrabold md:text-[40px]">Espace école</h1>
          <p className="max-w-md text-[15px] leading-relaxed text-brand-ink">
            Inscriptions, appel, devoirs, caisse et communiqués. Tout ce que vous saisissez ici apparaît aussitôt dans l'application des
            parents.
          </p>
        </div>
        <span className="hidden text-sm text-brand-ink md:block">Direction · Surveillance · Enseignants · Caisse</span>
      </div>
      <div className="flex flex-1 items-start justify-center rounded-t-[28px] bg-ground p-6 md:items-center md:rounded-none md:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') await signIn(email, password);
      else if (mode === 'signup') await signUp(name, email, password);
      else {
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

  async function google() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Frame>
      <div className="flex flex-col gap-5">
        <Button variant="secondary" size="lg" block onClick={() => void google()} className="border-[#c4ccc6] text-ink">
          <GoogleMark /> Continuer avec Google
        </Button>
        <div className="flex items-center gap-3 text-[13px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          ou avec un mot de passe
          <span className="h-px flex-1 bg-line" />
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode !== 'reset' ? (
            <Segmented
              label="Connexion ou première connexion"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'signin', label: 'Se connecter' },
                { value: 'signup', label: 'Première connexion' },
              ]}
            />
          ) : (
            <h2 className="font-display text-xl font-bold">Mot de passe oublié</h2>
          )}
          {mode === 'signup' && (
            <p className="text-sm leading-relaxed text-ink-2">
              Utilisez l'adresse e-mail que la direction a enregistrée pour vous, puis choisissez votre mot de passe. Un e-mail de
              vérification vous sera envoyé.
            </p>
          )}
          {info && <div className="rounded-xl bg-brand-soft px-3.5 py-3 text-sm font-semibold text-brand">{info}</div>}
          {error && <ErrorNote>{error}</ErrorNote>}
          {mode === 'signup' && <Field label="Votre nom" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}
          <Field label="Adresse e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          {mode !== 'reset' && (
            <Field
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          )}
          <Button type="submit" size="lg" block loading={busy}>
            {mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer mon mot de passe' : 'Recevoir le lien'}
          </Button>
          <button type="button" className="min-h-11 text-sm font-bold text-brand" onClick={() => setMode(mode === 'reset' ? 'signin' : 'reset')}>
            {mode === 'reset' ? 'Retour à la connexion' : 'Mot de passe oublié ?'}
          </button>
        </form>
        <p className="text-center text-[13px] leading-relaxed text-ink-3">
          Vous êtes parent ? Utilisez l'application ParentEcole sur Android
          {import.meta.env.VITE_PARENT_URL ? (
            <>
              {' '}
              ou l'espace parent en ligne :{' '}
              <a className="font-bold text-brand" href={import.meta.env.VITE_PARENT_URL}>
                {import.meta.env.VITE_PARENT_URL.replace(/^https?:\/\//, '')}
              </a>
            </>
          ) : (
            '.'
          )}
        </p>
        <p className="flex flex-wrap justify-center gap-x-4 text-[13px] text-ink-3">
          <a href={`${LEGAL_URL}/confidentialite.html`} target="_blank" rel="noreferrer" className="underline">
            Politique de confidentialité
          </a>
          <a href={`${LEGAL_URL}/conditions.html`} target="_blank" rel="noreferrer" className="underline">
            Conditions d'utilisation
          </a>
        </p>
      </div>
    </Frame>
  );
}

export function VerifyEmail() {
  const { user, sendVerification, checkEmailVerified, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Passe tout seul à la suite dès que le lien a été ouvert (même dans un autre onglet ou sur le téléphone).
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void checkEmailVerified().catch(() => undefined);
    };
    const timer = setInterval(check, 4000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [checkEmailVerified]);

  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold">Vérifiez votre adresse e-mail</h2>
        <p className="leading-relaxed text-ink-2">
          Un lien de vérification a été envoyé à <strong>{user?.email}</strong>. Ouvrez-le : cette page passera toute seule à la suite.
          Pensez à regarder dans les courriers indésirables.
        </p>
        {msg && <div className="rounded-xl bg-brand-soft px-3.5 py-3 text-sm font-semibold text-brand">{msg}</div>}
        <Button
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await checkEmailVerified().catch(() => false);
            if (ok) return;
            setBusy(false);
            setMsg("L'adresse n'est pas encore vérifiée. Ouvrez le lien reçu par e-mail.");
          }}
        >
          J'ai vérifié mon adresse
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await sendVerification().catch(() => undefined);
            setMsg('E-mail renvoyé.');
          }}
        >
          Renvoyer l'e-mail
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Utiliser un autre compte
        </Button>
      </div>
    </Frame>
  );
}

export function NoAccess({ reason }: { reason: 'none' | 'inactive' | 'error' }) {
  const { user, signOut } = useAuth();
  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold">{reason === 'inactive' ? 'Compte désactivé' : 'Accès non autorisé'}</h2>
        <p className="leading-relaxed text-ink-2">
          {reason === 'inactive'
            ? 'Votre accès a été désactivé par la direction de l’école.'
            : reason === 'error'
              ? 'Impossible de vérifier votre accès pour le moment. Vérifiez votre connexion et réessayez.'
              : `L'adresse ${user?.email ?? ''} n'est enregistrée dans le personnel d'aucune école. Demandez à la direction de vous ajouter avec cette adresse exacte.`}
        </p>
        <p className="text-sm leading-relaxed text-ink-3">Vous êtes parent ? Utilisez l'application ParentEcole sur votre téléphone.</p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </div>
    </Frame>
  );
}

export function SetupMissing() {
  return (
    <Frame>
      <h2 className="font-display text-2xl font-bold">Configuration manquante</h2>
      <p className="mt-3 leading-relaxed text-ink-2">
        Ce site n'est relié à aucune base de données. Renseignez les variables <code>VITE_FIREBASE_*</code> dans le fichier <code>.env</code> à
        la racine du projet (voir le README), puis relancez.
      </p>
    </Frame>
  );
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

/** Première connexion du personnel : inscription obligatoire d'une application d'authentification. */
export function EnrollMfa() {
  const { user, signOut, refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: TotpSecret; qrUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relogin, setRelogin] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    startTotpEnrollment(user)
      .then(async (s) => {
        if (!alive) return;
        setSetup(s);
        setQr(await QRCode.toDataURL(s.qrUrl, { margin: 1, width: 240, color: { dark: '#16231c', light: '#ffffff' } }));
      })
      .catch((e) => {
        if (!alive) return;
        if ((e as { code?: string }).code === 'auth/requires-recent-login') setRelogin(true);
        else setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || !setup || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await finishTotpEnrollment(user, setup.secret, code);
      await refresh();
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/mfa-enrollment-already-complete') {
        // Déjà inscrit (par exemple double validation) : c'est une réussite.
        await refresh().catch(() => undefined);
        return;
      }
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  const key = setup?.secret.secretKey.replace(/(.{4})/g, '$1 ').trim();

  return (
    <Frame>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-[13px] font-bold tracking-wider text-brand uppercase">
            <ShieldCheck size={16} aria-hidden="true" /> Sécurité du compte
          </span>
          <h2 className="font-display text-2xl font-bold">Activez la vérification en deux étapes</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Le personnel de l'école accède à des données sensibles. Un code à 6 chiffres, généré par une application sur votre téléphone, vous
            sera demandé à chaque connexion.
          </p>
        </div>
        {relogin ? (
          <>
            <ErrorNote>Par sécurité, reconnectez-vous avant d'activer la vérification en deux étapes.</ErrorNote>
            <Button onClick={() => void signOut()}>Se reconnecter</Button>
          </>
        ) : !setup ? (
          error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Préparation…" />
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-2">
              <li>
                Installez <strong>Google Authenticator</strong> ou <strong>Microsoft Authenticator</strong> sur votre téléphone.
              </li>
              <li>Dans l'application, touchez « + » puis « Scanner un code QR », et visez ce code :</li>
            </ol>
            {qr && <img src={qr} alt="QR code à scanner avec l'application d'authentification" className="size-48 self-center rounded-xl border border-line" />}
            <p className="text-center text-[13px] text-ink-3">
              Pas de caméra ? Choisissez « Saisir une clé » et tapez : <span className="font-mono font-bold break-all text-ink">{key}</span>
            </p>
            <ol start={3} className="list-decimal pl-5 text-[15px] leading-relaxed text-ink-2">
              <li>Saisissez le code à 6 chiffres affiché par l'application :</li>
            </ol>
            {error && <ErrorNote>{error}</ErrorNote>}
            <label htmlFor="enroll-code" className="sr-only">
              Code à 6 chiffres
            </label>
            <CodeInput id="enroll-code" value={code} onChange={setCode} />
            <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6}>
              Activer
            </Button>
            <p className="text-[13px] leading-relaxed text-ink-3">
              Gardez ce téléphone : le code sera demandé à chaque connexion. En cas de perte, contactez l'administrateur de la plateforme.
            </p>
          </>
        )}
        <Button variant="ghost" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </form>
    </Frame>
  );
}

/** Session ouverte sans le code (par exemple avant l'activation) : il faut se reconnecter. */
export function MfaRelogin() {
  const { signOut } = useAuth();
  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold">Reconnectez-vous</h2>
        <p className="leading-relaxed text-ink-2">
          Cette session a été ouverte sans le code de votre application d'authentification. Reconnectez-vous : le code vous sera demandé.
        </p>
        <Button size="lg" onClick={() => void signOut()}>
          Se reconnecter
        </Button>
      </div>
    </Frame>
  );
}
