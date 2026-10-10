import {
  addDoc,
  arrayRemove,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type {
  AppointmentSlot,
  ParentLink,
  ParentRequest,
  PermissionAnswer,
  PermissionSlip,
  RequestStatus,
  RsvpAnswer,
  SchoolDocument,
  SlotStatus,
  UserDevice,
  UserPrefs,
} from '../types';
import { queueNotification } from './notify';
import { clean, nowISO, refs, withoutId } from './refs';
import { q } from './queries';

// ── Autorisations de sortie ────────────────────────────────────────────────

export async function savePermission(db: Firestore, p: Omit<PermissionSlip, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
  const data = withoutId({ ...p, createdAt: p.createdAt ?? nowISO() });
  if (p.id) {
    await setDoc(refs.schoolSubDoc(db, p.schoolId, 'permissions', p.id), data);
    return p.id;
  }
  const ref = await addDoc(refs.schoolSub(db, p.schoolId, 'permissions'), data);
  void queueNotification(db, p.schoolId, 'permission', [ref.path]);
  return ref.id;
}

export async function deletePermission(db: Firestore, schoolId: string, id: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'permissions', id));
}

/** Le parent autorise (ou refuse) la sortie pour son enfant. */
export async function answerPermission(db: Firestore, a: Omit<PermissionAnswer, 'id' | 'at'>) {
  await setDoc(refs.studentSubDoc(db, a.studentId, 'permissionAnswers', a.permissionId), { ...a, at: nowISO() });
}

// ── Rendez-vous ────────────────────────────────────────────────────────────

/** L'enseignant (ou la direction) propose des créneaux. */
export async function createSlots(db: Firestore, slots: Omit<AppointmentSlot, 'id' | 'status' | 'createdAt'>[]) {
  const batch = writeBatch(db);
  const createdAt = nowISO();
  for (const s of slots) batch.set(doc(refs.schoolSub(db, s.schoolId, 'slots')), clean({ ...s, status: 'open' satisfies SlotStatus, createdAt }));
  await batch.commit();
}

/** L'enseignant confirme ou décline une demande (le parent est prévenu). */
export async function setSlotStatus(db: Firestore, slot: Pick<AppointmentSlot, 'id' | 'schoolId'>, status: SlotStatus) {
  const ref = refs.schoolSubDoc(db, slot.schoolId, 'slots', slot.id);
  await updateDoc(ref, { status });
  if (status === 'confirmed' || status === 'declined') void queueNotification(db, slot.schoolId, 'appointment', [ref.path]);
}

export async function deleteSlot(db: Firestore, schoolId: string, id: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'slots', id));
}

export interface BookingInput {
  uid: string;
  name: string;
  studentId: string;
  studentName: string;
  note?: string;
}

/** Le parent demande un créneau libre pour son enfant. */
export async function bookSlot(db: Firestore, slot: Pick<AppointmentSlot, 'id' | 'schoolId'>, b: BookingInput) {
  await updateDoc(refs.schoolSubDoc(db, slot.schoolId, 'slots', slot.id), {
    status: 'requested' satisfies SlotStatus,
    bookedBy: b.uid,
    bookedByName: b.name,
    studentId: b.studentId,
    studentName: b.studentName,
    note: b.note?.trim() ?? '',
    bookedAt: nowISO(),
  });
}

/** Le parent annule sa demande : le créneau redevient libre. */
export async function cancelBooking(db: Firestore, slot: Pick<AppointmentSlot, 'id' | 'schoolId'>) {
  await updateDoc(refs.schoolSubDoc(db, slot.schoolId, 'slots', slot.id), {
    status: 'open' satisfies SlotStatus,
    bookedBy: null,
    bookedByName: null,
    studentId: null,
    studentName: null,
    note: null,
    bookedAt: null,
  });
}

// ── Demandes des parents ───────────────────────────────────────────────────

export async function createRequest(db: Firestore, r: Omit<ParentRequest, 'id' | 'status' | 'createdAt'>) {
  const ref = await addDoc(refs.studentSub(db, r.studentId, 'requests'), clean({ ...r, status: 'pending' satisfies RequestStatus, createdAt: nowISO() }));
  return ref.id;
}

export async function cancelRequest(db: Firestore, r: Pick<ParentRequest, 'id' | 'studentId'>) {
  await deleteDoc(refs.studentSubDoc(db, r.studentId, 'requests', r.id));
}

/** L'école traite la demande ; le parent reçoit la réponse. */
export async function handleRequest(
  db: Firestore,
  r: Pick<ParentRequest, 'id' | 'studentId' | 'schoolId'>,
  status: Exclude<RequestStatus, 'pending'>,
  answer: string,
  handledBy: string,
) {
  const ref = refs.studentSubDoc(db, r.studentId, 'requests', r.id);
  await updateDoc(ref, { status, answer: answer.trim(), handledBy, handledAt: nowISO() });
  void queueNotification(db, r.schoolId, 'request', [ref.path]);
}

// ── Documents de l'école ───────────────────────────────────────────────────

export async function saveDocument(db: Firestore, d: Omit<SchoolDocument, 'id' | 'createdAt'>) {
  const ref = await addDoc(refs.schoolSub(db, d.schoolId, 'documents'), { ...d, title: d.title.trim(), url: d.url.trim(), createdAt: nowISO() });
  return ref.id;
}

export async function deleteDocument(db: Firestore, schoolId: string, id: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'documents', id));
}

// ── Confirmations des parents ──────────────────────────────────────────────

/** Le parent confirme avoir lu un communiqué important. */
export async function acknowledgeAnnouncement(db: Firestore, schoolId: string, announcementId: string, who: { uid: string; name: string }) {
  await setDoc(refs.ack(db, schoolId, announcementId, who.uid), { uid: who.uid, name: who.name, at: nowISO() });
}

/** Le parent répond à une réunion. */
export async function answerEvent(db: Firestore, schoolId: string, eventId: string, who: { uid: string; name: string }, answer: RsvpAnswer) {
  await setDoc(refs.rsvp(db, schoolId, eventId, who.uid), { uid: who.uid, name: who.name, answer, at: nowISO() });
}

// ── Préférences et appareils du parent ─────────────────────────────────────

export async function saveUserPrefs(db: Firestore, uid: string, prefs: UserPrefs) {
  await setDoc(refs.user(db, uid), { prefs: clean(prefs), updatedAt: nowISO() }, { merge: true });
}

/** Clé courte et sûre pour ranger un appareil dans la fiche du parent. */
export const deviceKey = (token: string) => token.replace(/[^A-Za-z0-9]/g, '').slice(-24) || 'appareil';

export async function saveDevice(db: Firestore, uid: string, device: UserDevice) {
  await setDoc(refs.user(db, uid), { devices: { [deviceKey(device.token)]: device }, updatedAt: nowISO() }, { merge: true });
}

/** Cet appareil ne recevra plus de notifications. */
export async function removeDevice(db: Firestore, uid: string, token: string) {
  await updateDoc(refs.user(db, uid), { [`devices.${deviceKey(token)}`]: deleteField(), fcmTokens: arrayRemove(token), updatedAt: nowISO() });
}

/**
 * Efface ce que le parent a créé : liaisons avec ses enfants, accès aux écoles et préférences.
 * Les dossiers scolaires (notes, présences, paiements) restent à l'école.
 */
export async function deleteParentData(db: Firestore, uid: string, links: ParentLink[]) {
  const batch = writeBatch(db);
  for (const l of links) batch.delete(refs.studentSubDoc(db, l.studentId, 'parents', uid));
  for (const schoolId of new Set(links.map((l) => l.schoolId))) batch.delete(refs.schoolParent(db, schoolId, uid));
  batch.delete(refs.user(db, uid));
  await batch.commit();
}

/** Toutes les réponses d'un parent (réunions), pour afficher ce qu'il a déjà répondu. */
export async function loadMyRsvps(db: Firestore, uid: string) {
  const snap = await getDocs(q.myRsvps(db, uid));
  return snap.docs.map((d) => ({ path: d.ref.path, ...(d.data() as { answer: RsvpAnswer }) }));
}
