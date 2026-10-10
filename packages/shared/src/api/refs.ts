import {
  collection,
  collectionGroup,
  doc,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';

export type SchoolSub = 'classes' | 'fees' | 'announcements' | 'events' | 'homework' | 'evaluations' | 'timetables' | 'permissions' | 'slots' | 'documents';
export type StudentSub = 'parents' | 'attendance' | 'payments' | 'conduct' | 'homeworkSeen' | 'grades' | 'bulletins' | 'permissionAnswers' | 'requests';

export const refs = {
  school: (db: Firestore, schoolId: string) => doc(db, 'schools', schoolId),
  schools: (db: Firestore) => collection(db, 'schools'),
  schoolSub: (db: Firestore, schoolId: string, sub: SchoolSub) => collection(db, 'schools', schoolId, sub),
  schoolSubDoc: (db: Firestore, schoolId: string, sub: SchoolSub, id: string) => doc(db, 'schools', schoolId, sub, id),
  member: (db: Firestore, email: string) => doc(db, 'members', email.trim().toLowerCase()),
  members: (db: Firestore) => collection(db, 'members'),
  superadmin: (db: Firestore, email: string) => doc(db, 'superadmins', email.trim().toLowerCase()),
  student: (db: Firestore, studentId: string) => doc(db, 'students', studentId),
  students: (db: Firestore) => collection(db, 'students'),
  studentSub: (db: Firestore, studentId: string, sub: StudentSub) => collection(db, 'students', studentId, sub),
  studentSubDoc: (db: Firestore, studentId: string, sub: StudentSub, id: string) => doc(db, 'students', studentId, sub, id),
  group: (db: Firestore, sub: StudentSub) => collectionGroup(db, sub),
  code: (db: Firestore, matricule: string) => doc(db, 'codes', matricule),
  schoolParent: (db: Firestore, schoolId: string, uid: string) => doc(db, 'schoolParents', `${schoolId}_${uid}`),
  user: (db: Firestore, uid: string) => doc(db, 'users', uid),
  ack: (db: Firestore, schoolId: string, announcementId: string, uid: string) => doc(db, 'schools', schoolId, 'announcements', announcementId, 'acks', uid),
  acks: (db: Firestore, schoolId: string, announcementId: string) => collection(db, 'schools', schoolId, 'announcements', announcementId, 'acks'),
  rsvp: (db: Firestore, schoolId: string, eventId: string, uid: string) => doc(db, 'schools', schoolId, 'events', eventId, 'rsvps', uid),
  rsvps: (db: Firestore, schoolId: string, eventId: string) => collection(db, 'schools', schoolId, 'events', eventId, 'rsvps'),
  /** Groupe de collections quelconque (confirmations, réponses). */
  groupOf: (db: Firestore, name: 'acks' | 'rsvps') => collectionGroup(db, name),
};

export function fromDoc<T>(snap: DocumentSnapshot<DocumentData>): T | null {
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as T) : null;
}

export function fromQuery<T>(snap: QuerySnapshot<DocumentData>): T[] {
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
}

export const nowISO = () => new Date().toISOString();

/** Firestore refuse les champs `undefined` : on les retire (récursivement dans les objets simples). */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clean(v)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

/** Retire `id` avant l'écriture (il sert de nom de document, pas de champ). */
export function withoutId<T extends { id?: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value;
  return clean(rest);
}

/** Message lisible pour les erreurs Firebase les plus courantes. */
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'permission-denied': "Action refusée : vous n'avez pas les droits nécessaires.",
    'unavailable': 'Pas de connexion au serveur. Vérifiez votre réseau.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cet e-mail.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail. Connectez-vous.',
    'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/network-request-failed': 'Pas de connexion internet.',
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre de connexion. Autorisez les fenêtres pour ce site.',
    'auth/invalid-verification-code': 'Code incorrect. Vérifiez que l’heure de votre téléphone est juste, puis réessayez avec le code suivant.',
    'auth/missing-code': 'Saisissez le code à 6 chiffres.',
    'auth/requires-recent-login': 'Par sécurité, reconnectez-vous puis recommencez.',
    'auth/unverified-email': 'Vérifiez d’abord votre adresse e-mail.',
    'auth/totp-challenge-timeout': 'Délai dépassé : reconnectez-vous.',
    'auth/code-expired': 'Délai dépassé : reconnectez-vous.',
    'auth/maximum-second-factor-count-exceeded': 'Ce compte a déjà le nombre maximal de méthodes de vérification.',
  };
  if (map[code]) return map[code];
  if (error instanceof Error && error.message) return error.message;
  return 'Une erreur est survenue.';
}
