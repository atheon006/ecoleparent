import {
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  GoogleAuthProvider,
  multiFactor,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  TotpMultiFactorGenerator,
  updateProfile,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getFirebase } from './firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Second facteur utilisé pour la session en cours (« totp ») ou null. */
  secondFactor: string | null;
  /** La connexion attend le code à 6 chiffres de l'application d'authentification. */
  mfaPending: boolean;
  /** Une application d'authentification est inscrite sur le compte. */
  totpEnrolled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** Connexion avec un jeton d'identité Google obtenu par le SDK natif (APK Android). */
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  /** Termine une connexion en attente avec le code de l'application d'authentification. */
  completeMfa: (code: string) => Promise<void>;
  cancelMfa: () => void;
  resetPassword: (email: string) => Promise<void>;
  sendVerification: () => Promise<void>;
  /** Recharge le compte (après vérification de l'e-mail) et rafraîchit le jeton. */
  refresh: () => Promise<void>;
  /** Relit le compte : renvoie vrai (et rafraîchit le jeton) si l'adresse vient d'être vérifiée. */
  checkEmailVerified: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Après le clic sur le lien de vérification, Firebase propose de revenir sur le site d'origine. */
function verificationSettings() {
  if (typeof window === 'undefined') return undefined;
  const { protocol, hostname, origin } = window.location;
  return protocol === 'https:' && hostname !== 'localhost' ? { url: origin } : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = getFirebase();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [secondFactor, setSecondFactor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  // Change à chaque événement de jeton : l'objet `user` reste le même alors que ses facteurs
  // inscrits changent, il faut donc forcer les écrans à le relire.
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        const factor = u ? ((await u.getIdTokenResult().catch(() => null))?.signInSecondFactor ?? null) : null;
        setUser(u);
        setSecondFactor(factor);
        setVersion((v) => v + 1);
        setLoading(false);
      }),
    [auth],
  );

  /** Une connexion d'un compte protégé par un code lève une erreur : on garde de quoi la terminer. */
  const withMfa = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/multi-factor-auth-required') {
          setMfaResolver(getMultiFactorResolver(auth, e as MultiFactorError));
          return;
        }
        throw e;
      }
    },
    [auth],
  );

  const signIn = useCallback((email: string, password: string) => withMfa(() => signInWithEmailAndPassword(auth, email.trim(), password)), [auth, withMfa]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
    await sendEmailVerification(cred.user, verificationSettings()).catch(() => undefined);
    await cred.user.getIdToken(true);
  }, [auth]);

  const signInWithGoogle = useCallback(
    () =>
      withMfa(() => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return signInWithPopup(auth, provider, browserPopupRedirectResolver);
      }),
    [auth, withMfa],
  );

  const signInWithGoogleIdToken = useCallback(
    (idToken: string) => withMfa(() => signInWithCredential(auth, GoogleAuthProvider.credential(idToken))),
    [auth, withMfa],
  );

  const completeMfa = useCallback(
    async (code: string) => {
      if (!mfaResolver) return;
      const hint = mfaResolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
      if (!hint) throw new Error('Ce compte utilise une méthode de vérification non prise en charge ici.');
      await mfaResolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\D/g, '')));
      setMfaResolver(null);
    },
    [mfaResolver],
  );

  const cancelMfa = useCallback(() => setMfaResolver(null), []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, [auth]);

  const sendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser, verificationSettings());
  }, [auth]);

  const refresh = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const result = await auth.currentUser.getIdTokenResult();
    setUser(auth.currentUser);
    setSecondFactor(result.signInSecondFactor ?? null);
    setVersion((v) => v + 1);
  }, [auth]);

  const checkEmailVerified = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return false;
    if (!u.emailVerified) await u.reload();
    if (!u.emailVerified) return false;
    // Nouveau jeton avec email_verified, exigé par les règles Firestore.
    await u.getIdToken(true);
    setUser(u);
    setVersion((v) => v + 1);
    return true;
  }, [auth]);

  const signOut = useCallback(async () => {
    setMfaResolver(null);
    await fbSignOut(auth);
  }, [auth]);

  const mfaPending = mfaResolver !== null;
  const value = useMemo(
    () => ({
      user,
      loading,
      secondFactor,
      mfaPending,
      totpEnrolled: hasTotp(user),
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleIdToken,
      completeMfa,
      cancelMfa,
      resetPassword,
      sendVerification,
      refresh,
      checkEmailVerified,
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, version, loading, secondFactor, mfaPending, signIn, signUp, signInWithGoogle, signInWithGoogleIdToken, completeMfa, cancelMfa, resetPassword, sendVerification, refresh, checkEmailVerified, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}

/** Prénom pour les salutations : displayName, sinon la partie locale de l'e-mail. */
export function firstName(user: User | null): string {
  const name = user?.displayName?.trim();
  if (name) return name.split(/\s+/)[0];
  const local = user?.email?.split('@')[0] ?? '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
}

// ── Inscription d'une application d'authentification (TOTP) ────────────────

export function hasTotp(user: User | null): boolean {
  return !!user && multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

/** Prépare l'inscription : secret et lien otpauth:// à afficher en QR code. */
export async function startTotpEnrollment(user: User): Promise<{ secret: TotpSecret; qrUrl: string }> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return { secret, qrUrl: secret.generateQrCodeUrl(user.email ?? 'personnel', 'ParentEcole') };
}

/** Valide le premier code et rattache l'application au compte. */
export async function finishTotpEnrollment(user: User, secret: TotpSecret, code: string): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\D/g, ''));
  await multiFactor(user).enroll(assertion, "Application d'authentification");
  await user.getIdToken(true);
}
