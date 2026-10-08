import { getAuth } from 'firebase/auth';
import { addDoc, collection, type Firestore } from 'firebase/firestore';
import { nowISO } from './refs';

export type NotificationKind = 'attendance' | 'payment' | 'conduct' | 'homework' | 'announcement';

/** Adresse du Worker qui envoie les notifications push (voir push/README). */
const PUSH_URL = import.meta.env.VITE_PUSH_URL;

/**
 * Demande l'envoi d'une notification aux parents concernés. On ne donne que les chemins des
 * documents qui viennent d'être enregistrés : le Worker les relit et écrit lui-même le message.
 * Sans effet bloquant : un échec n'empêche jamais l'enregistrement principal.
 */
export async function queueNotification(db: Firestore, schoolId: string, kind: NotificationKind, paths: string[]) {
  if (!paths.length) return;
  try {
    const email = (getAuth(db.app).currentUser?.email ?? '').toLowerCase();
    await addDoc(collection(db, 'notifications'), { schoolId, kind, paths, status: 'pending', createdBy: email, createdAt: nowISO() });
    await kickPush(db);
  } catch (e) {
    console.warn('[push] demande non enregistrée', e);
  }
}

/** Réveille le Worker pour un envoi immédiat (sinon il passe de lui-même chaque minute). */
async function kickPush(db: Firestore) {
  if (!PUSH_URL) return;
  const token = await getAuth(db.app).currentUser?.getIdToken();
  if (!token) return;
  await fetch(`${PUSH_URL.replace(/\/$/, '')}/kick`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(
    () => undefined,
  );
}
