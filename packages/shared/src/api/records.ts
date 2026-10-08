import { addDoc, arrayUnion, deleteDoc, doc, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { buildClassStatuses } from '../attendance';
import { paymentReference } from '../codes';
import type {
  Attendance,
  AttendanceStatus,
  Conduct,
  HomeworkSeen,
  JustificationStatus,
  Payment,
  PaymentMethod,
  Student,
} from '../types';
import { queueNotification } from './notify';
import { clean, nowISO, refs } from './refs';

// ── Présences ──────────────────────────────────────────────────────────────

/** Écritures par lot de 12 : chaque élève coûte une lecture dans les règles (limite de 20 par lot). */
const ATTENDANCE_CHUNK = 12;

export interface ClassAttendanceInput {
  schoolId: string;
  classId: string;
  date: string;
  students: Pick<Student, 'id' | 'firstName' | 'lastName'>[];
  marks: Record<string, { status: Exclude<AttendanceStatus, 'present'>; reason?: string }>;
  recordedBy: string;
  recordedByName: string;
  /** Statuts déjà enregistrés ce jour-là : pas de nouvelle notification si rien n'a changé. */
  previous?: Record<string, AttendanceStatus>;
}

/** Appel express : enregistre toute la classe, les élèves non cochés sont présents. */
export async function saveClassAttendance(db: Firestore, input: ClassAttendanceInput) {
  const statuses = buildClassStatuses(
    input.students.map((s) => s.id),
    input.marks,
  );
  const names = new Map(input.students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
  const recordedAt = nowISO();
  const chunks: (typeof statuses)[] = [];
  for (let i = 0; i < statuses.length; i += ATTENDANCE_CHUNK) chunks.push(statuses.slice(i, i + ATTENDANCE_CHUNK));

  await Promise.all(
    chunks.map((chunk) => {
      const batch = writeBatch(db);
      for (const s of chunk) {
        const record: Omit<Attendance, 'id'> = {
          studentId: s.studentId,
          schoolId: input.schoolId,
          classId: input.classId,
          studentName: names.get(s.studentId) ?? '',
          date: input.date,
          status: s.status,
          reason: s.reason ?? '',
          recordedBy: input.recordedBy,
          recordedByName: input.recordedByName,
          recordedAt,
        };
        // merge : on garde une éventuelle justification déjà envoyée par le parent.
        batch.set(refs.studentSubDoc(db, s.studentId, 'attendance', input.date), clean(record), { merge: true });
      }
      return batch.commit();
    }),
  );

  // Absences et retards nouveaux : notification aux parents (8 élèves au plus par demande).
  const changed = statuses
    .filter((s) => (s.status === 'absent' || s.status === 'late') && input.previous?.[s.studentId] !== s.status)
    .map((s) => `students/${s.studentId}/attendance/${input.date}`);
  for (let i = 0; i < changed.length; i += 8) void queueNotification(db, input.schoolId, 'attendance', changed.slice(i, i + 8));
}

/** Le parent justifie une absence ou un retard. */
export async function justifyAbsence(db: Firestore, studentId: string, date: string, justification: string) {
  await updateDoc(refs.studentSubDoc(db, studentId, 'attendance', date), {
    justification: justification.trim(),
    justifiedAt: nowISO(),
    justificationStatus: 'pending' satisfies JustificationStatus,
  });
}

/** L'école accepte (absence excusée) ou refuse la justification. */
export async function reviewJustification(db: Firestore, record: Pick<Attendance, 'studentId' | 'date' | 'status'>, accept: boolean) {
  await updateDoc(refs.studentSubDoc(db, record.studentId, 'attendance', record.date), {
    justificationStatus: (accept ? 'accepted' : 'rejected') satisfies JustificationStatus,
    ...(accept && record.status === 'absent' ? { status: 'excused' satisfies AttendanceStatus } : {}),
  });
}

// ── Paiements ──────────────────────────────────────────────────────────────

export interface PaymentInput {
  student: Pick<Student, 'id' | 'schoolId' | 'firstName' | 'lastName' | 'className'>;
  feeId: string;
  feeName: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  notes?: string;
  recordedBy: string;
  recordedByName: string;
}

export async function recordPayment(db: Firestore, input: PaymentInput): Promise<Payment> {
  if (!(input.amount > 0)) throw new Error('Le montant doit être supérieur à zéro.');
  const ref = doc(refs.studentSub(db, input.student.id, 'payments'));
  const payment: Payment = clean({
    id: ref.id,
    studentId: input.student.id,
    schoolId: input.student.schoolId,
    studentName: `${input.student.firstName} ${input.student.lastName}`,
    className: input.student.className,
    feeId: input.feeId,
    feeName: input.feeName,
    amount: input.amount,
    method: input.method,
    reference: paymentReference(new Date(input.date).getFullYear()),
    date: input.date,
    notes: input.notes?.trim() || undefined,
    recordedBy: input.recordedBy,
    recordedByName: input.recordedByName,
    createdAt: nowISO(),
  });
  const { id: _id, ...data } = payment;
  await setDoc(ref, data);
  void queueNotification(db, payment.schoolId, 'payment', [ref.path]);
  return payment;
}

export async function deletePayment(db: Firestore, payment: Pick<Payment, 'id' | 'studentId'>) {
  await deleteDoc(refs.studentSubDoc(db, payment.studentId, 'payments', payment.id));
}

// ── Conduite ───────────────────────────────────────────────────────────────

export async function addConduct(db: Firestore, c: Omit<Conduct, 'id' | 'createdAt'>) {
  const ref = await addDoc(refs.studentSub(db, c.studentId, 'conduct'), clean({ ...c, createdAt: nowISO() }));
  void queueNotification(db, c.schoolId, 'conduct', [ref.path]);
  return ref.id;
}

export async function deleteConduct(db: Firestore, c: Pick<Conduct, 'id' | 'studentId'>) {
  await deleteDoc(refs.studentSubDoc(db, c.studentId, 'conduct', c.id));
}

// ── Devoirs vus par le parent (signature du journal de classe) ─────────────

export async function markHomeworkSeen(db: Firestore, seen: Omit<HomeworkSeen, 'seenAt'>) {
  await setDoc(refs.studentSubDoc(db, seen.studentId, 'homeworkSeen', seen.homeworkId), { ...seen, seenAt: nowISO() });
}

export async function unmarkHomeworkSeen(db: Firestore, studentId: string, homeworkId: string) {
  await deleteDoc(refs.studentSubDoc(db, studentId, 'homeworkSeen', homeworkId));
}

// ── Jetons de notification (app parent) ────────────────────────────────────

export async function saveUserProfile(db: Firestore, uid: string, data: { name?: string; email?: string }) {
  await setDoc(refs.user(db, uid), clean({ ...data, updatedAt: nowISO() }), { merge: true });
}

export async function addFcmToken(db: Firestore, uid: string, token: string) {
  await setDoc(refs.user(db, uid), { fcmTokens: arrayUnion(token), updatedAt: nowISO() }, { merge: true });
}
