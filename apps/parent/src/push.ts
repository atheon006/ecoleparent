import { addFcmToken } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useCallback, useEffect, useState } from 'react';
import { isNative } from './native';

/** Notifications du navigateur (site des parents) : état de l'autorisation sur cet appareil. */
export type WebPushState = 'unsupported' | 'default' | 'denied' | 'granted';

// Sur iPhone, seulement une fois le site ajouté à l'écran d'accueil (iOS 16.4 et plus).
const supported = () =>
  !isNative && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function currentState(): WebPushState {
  return supported() ? (Notification.permission as WebPushState) : 'unsupported';
}

/** Abonne ce navigateur aux notifications et enregistre son jeton sur le compte. */
async function subscribe(uid: string): Promise<void> {
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return;
  const registration = await navigator.serviceWorker.register('/push-sw.js');
  const { app, db } = getFirebase();
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: registration });
  if (token) await addFcmToken(db, uid, token);
}

export function useWebPush(uid: string | undefined) {
  const [state, setState] = useState<WebPushState>(currentState);

  // Déjà autorisé : on renouvelle le jeton sans rien demander.
  useEffect(() => {
    if (uid && currentState() === 'granted') void subscribe(uid).catch((e) => console.warn('[push]', e));
  }, [uid]);

  const enable = useCallback(async () => {
    if (!uid || !supported()) return;
    const permission = await Notification.requestPermission();
    setState(permission as WebPushState);
    if (permission === 'granted') await subscribe(uid);
  }, [uid]);

  return { state, enable };
}
