import { addDoc, deleteDoc, doc, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { schoolCodePrefix } from '../codes';
import type {
  Announcement,
  ClassRoom,
  FeeCategory,
  Homework,
  Member,
  School,
  SchoolEvent,
  StaffRole,
} from '../types';
import { queueNotification } from './notify';
import { clean, nowISO, refs, withoutId } from './refs';

// ── Écoles (super-administrateur) ──────────────────────────────────────────

export interface NewSchoolInput {
  name: string;
  address: string;
  phone: string;
  currency: string;
  adminEmail: string;
  adminName: string;
}

/** Crée l'école et le compte du directeur (members/{email}) en une seule écriture. */
export async function createSchool(db: Firestore, input: NewSchoolInput): Promise<string> {
  const ref = doc(refs.schools(db));
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const school: Omit<School, 'id'> = {
    name: input.name.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    currency: input.currency.trim() || '$',
    codePrefix: schoolCodePrefix(input.name),
    adminEmail,
    active: true,
    createdAt: nowISO(),
  };
  const admin: Member = {
    email: adminEmail,
    schoolId: ref.id,
    role: 'admin',
    name: input.adminName.trim(),
    classIds: [],
    active: true,
    createdAt: nowISO(),
  };
  const batch = writeBatch(db);
  batch.set(ref, school);
  batch.set(refs.member(db, adminEmail), admin);
  await batch.commit();
  return ref.id;
}

export async function updateSchool(db: Firestore, schoolId: string, patch: Partial<Pick<School, 'name' | 'address' | 'phone' | 'currency'>>) {
  await updateDoc(refs.school(db, schoolId), clean(patch));
}

export async function setSchoolActive(db: Firestore, schoolId: string, active: boolean) {
  await updateDoc(refs.school(db, schoolId), { active });
}

// ── Personnel ──────────────────────────────────────────────────────────────

export interface MemberInput {
  email: string;
  schoolId: string;
  role: StaffRole;
  name: string;
  phone?: string;
  classIds?: string[];
}

export async function saveMember(db: Firestore, input: MemberInput, existing?: Member): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const member: Member = {
    email,
    schoolId: input.schoolId,
    role: input.role,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    classIds: input.classIds ?? [],
    active: existing?.active ?? true,
    createdAt: existing?.createdAt ?? nowISO(),
  };
  try {
    await setDoc(refs.member(db, email), clean(member));
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied' && !existing) {
      throw new Error('Cet e-mail est déjà utilisé par le personnel d’une autre école.');
    }
    throw e;
  }
}

export async function setMemberActive(db: Firestore, email: string, active: boolean) {
  await updateDoc(refs.member(db, email), { active });
}

export async function deleteMember(db: Firestore, email: string) {
  await deleteDoc(refs.member(db, email));
}

// ── Classes ────────────────────────────────────────────────────────────────

export async function saveClass(db: Firestore, cls: Omit<ClassRoom, 'id'> & { id?: string }) {
  if (cls.id) {
    await setDoc(refs.schoolSubDoc(db, cls.schoolId, 'classes', cls.id), withoutId(cls));
    return cls.id;
  }
  const ref = await addDoc(refs.schoolSub(db, cls.schoolId, 'classes'), withoutId(cls));
  return ref.id;
}

export async function deleteClass(db: Firestore, schoolId: string, classId: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'classes', classId));
}

// ── Frais ──────────────────────────────────────────────────────────────────

export async function saveFee(db: Firestore, fee: Omit<FeeCategory, 'id'> & { id?: string }) {
  const total = fee.installments.reduce((s, i) => s + i.amount, 0);
  const data = withoutId({ ...fee, totalAmount: fee.installments.length ? total : fee.totalAmount });
  if (fee.id) {
    await setDoc(refs.schoolSubDoc(db, fee.schoolId, 'fees', fee.id), data);
    return fee.id;
  }
  const ref = await addDoc(refs.schoolSub(db, fee.schoolId, 'fees'), data);
  return ref.id;
}

export async function deleteFee(db: Firestore, schoolId: string, feeId: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'fees', feeId));
}

// ── Communiqués et agenda ──────────────────────────────────────────────────

export async function publishAnnouncement(db: Firestore, a: Omit<Announcement, 'id' | 'publishedAt'>) {
  const ref = await addDoc(refs.schoolSub(db, a.schoolId, 'announcements'), clean({ ...a, publishedAt: nowISO() }));
  void queueNotification(db, a.schoolId, 'announcement', [ref.path]);
  return ref.id;
}

export async function deleteAnnouncement(db: Firestore, schoolId: string, id: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'announcements', id));
}

export async function saveEvent(db: Firestore, e: Omit<SchoolEvent, 'id'> & { id?: string }) {
  if (e.id) {
    await setDoc(refs.schoolSubDoc(db, e.schoolId, 'events', e.id), withoutId(e));
    return e.id;
  }
  const ref = await addDoc(refs.schoolSub(db, e.schoolId, 'events'), withoutId(e));
  return ref.id;
}

export async function deleteEvent(db: Firestore, schoolId: string, id: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'events', id));
}

// ── Devoirs ────────────────────────────────────────────────────────────────

export async function addHomework(db: Firestore, h: Omit<Homework, 'id' | 'createdAt'>) {
  const ref = await addDoc(refs.schoolSub(db, h.schoolId, 'homework'), clean({ ...h, createdAt: nowISO() }));
  void queueNotification(db, h.schoolId, 'homework', [ref.path]);
  return ref.id;
}

export async function deleteHomework(db: Firestore, schoolId: string, id: string) {
  await deleteDoc(refs.schoolSubDoc(db, schoolId, 'homework', id));
}
