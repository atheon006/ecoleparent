import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** Partage un texte (reçu, code élève) : feuille de partage Android, sinon Web Share, sinon presse-papiers. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, dialogTitle: title });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return 'shared';
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/**
 * Bouton « retour » d'Android. `handler` renvoie vrai s'il a traité le retour
 * (fermer une fenêtre, revenir à l'accueil) ; sinon l'app se met en arrière-plan.
 */
export function onBackButton(handler: () => boolean): () => void {
  if (!isNative) return () => undefined;
  let remove: (() => void) | undefined;
  let cancelled = false;
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', () => {
      if (!handler()) void App.minimizeApp();
    }).then((h) => {
      if (cancelled) void h.remove();
      else remove = () => void h.remove();
    }),
  );
  return () => {
    cancelled = true;
    remove?.();
  };
}

export async function setupStatusBar() {
  await setStatusBarOnDark(false);
}

/** Icônes de la barre d'état claires (sur fond vert) ou foncées (sur fond clair). */
export async function setStatusBarOnDark(dark: boolean) {
  if (!isNative) return;
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color: dark ? '#1e4a38' : '#f4f5f0' }).catch(() => undefined);
}

/** Identifiant OAuth « Web » du projet (Authentication › Google › Configuration du SDK Web). */
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;

/** Connexion Google disponible : toujours sur le web, sur Android si l'identifiant est configuré. */
export const googleSignInAvailable = !isNative || Boolean(GOOGLE_WEB_CLIENT_ID);

let socialReady: Promise<void> | null = null;

/**
 * Connexion Google native (Credential Manager d'Android) : renvoie un jeton d'identité
 * que Firebase Auth accepte. Renvoie null si la personne a annulé.
 */
export async function nativeGoogleIdToken(): Promise<string | null> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  socialReady ??= SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } });
  await socialReady;
  try {
    const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
    const result = res.result as { idToken?: string | null };
    if (!result.idToken) throw new Error('Google n’a pas renvoyé de jeton. Réessayez.');
    return result.idToken;
  } catch (e) {
    if (/cancel|annul/i.test(String((e as Error)?.message ?? e))) return null;
    throw e;
  }
}

/** Oublie le compte Google choisi, pour pouvoir en prendre un autre à la prochaine connexion. */
export async function nativeGoogleSignOut() {
  if (!isNative || !GOOGLE_WEB_CLIENT_ID) return;
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.logout({ provider: 'google' }).catch(() => undefined);
}

/**
 * Notifications push (Firebase Cloud Messaging). Désactivées tant que
 * VITE_PUSH_ENABLED n'est pas « true » : elles exigent google-services.json dans l'APK.
 * `onOpen` est appelé quand la personne touche une notification.
 */
export async function setupPush(onToken: (token: string) => void, onOpen?: () => void): Promise<void> {
  if (!isNative || import.meta.env.VITE_PUSH_ENABLED !== 'true') return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  // Canal « Messages de l'école » (Android 8 et plus) : le Worker d'envoi l'indique dans chaque message.
  await PushNotifications.createChannel({
    id: 'ecole',
    name: "Messages de l'école",
    description: 'Absences, paiements, conduite, devoirs et communiqués',
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch(() => undefined);
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  await PushNotifications.addListener('registration', (t) => onToken(t.value));
  if (onOpen) await PushNotifications.addListener('pushNotificationActionPerformed', () => onOpen());
  await PushNotifications.register();
}
