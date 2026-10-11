import { doc, getDocs, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { averageScore } from '../grades';
import type { Bulletin, Evaluation, Grade, Subject, Timetable } from '../types';
import { queueNotification } from './notify';
import { q } from './queries';
import { clean, nowISO, refs, withoutId } from './refs';

/**
 * Écritures par lot de 12 : chaque note ou bulletin coûte une lecture de la fiche de l'élève
 * dans les règles (limite de 20 lectures par lot), comme pour l'appel.
 */
const CHUNK = 12;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ── Branches d'une classe ──────────────────────────────────────────────────

export async function saveSubjects(db: Firestore, schoolId: string, classId: string, subjects: Subject[]) {
  await updateDoc(refs.schoolSubDoc(db, schoolId, 'classes', classId), {
    subjects: subjects.map((s) => clean({ id: s.id, name: s.name.trim(), max: s.max, examMax: s.examMax })),
  });
}

// ── Évaluations et notes ───────────────────────────────────────────────────

export interface EvaluationInput {
  /** Présent pour modifier une évaluation existante. */
  id?: string;
  evaluation: Omit<Evaluation, 'id' | 'createdAt' | 'count' | 'average'>;
  /** Note de chaque élève de la classe (null = absent ou non noté). */
  scores: Record<string, number | null>;
  /** Notes déjà enregistrées : on ne prévient les parents que des notes nouvelles ou changées. */
  previous?: Record<string, number | null>;
  createdAt?: string;
}

/** Enregistre l'évaluation, ses statistiques et la note de chaque élève. Renvoie l'identifiant. */
export async function saveEvaluation(db: Firestore, input: EvaluationInput): Promise<string> {
  const e = input.evaluation;
  for (const score of Object.values(input.scores)) {
    if (score !== null && (Number.isNaN(score) || score < 0 || score > e.max)) {
      throw new Error(`Note invalide (${score}) : elle doit être comprise entre 0 et ${e.max}.`);
    }
  }
  const ref = input.id ? refs.schoolSubDoc(db, e.schoolId, 'evaluations', input.id) : doc(refs.schoolSub(db, e.schoolId, 'evaluations'));
  const values = Object.values(input.scores);
  const stats = { count: values.filter((v) => v !== null).length, average: averageScore(values) ?? 0 };
  await setDoc(ref, clean({ ...e, ...stats, createdAt: input.createdAt ?? nowISO() }));

  const updatedAt = nowISO();
  const entries = Object.entries(input.scores);
  await Promise.all(
    chunks(entries, CHUNK).map((part) => {
      const batch = writeBatch(db);
      for (const [studentId, score] of part) {
        const grade: Omit<Grade, 'id'> = {
          evaluationId: ref.id,
          studentId,
          schoolId: e.schoolId,
          classId: e.classId,
          subjectId: e.subjectId,
          subjectName: e.subjectName,
          year: e.year,
          period: e.period,
          title: e.title,
          date: e.date,
          score,
          max: e.max,
          createdBy: e.createdBy,
          updatedAt,
        };
        batch.set(refs.studentSubDoc(db, studentId, 'grades', ref.id), grade);
      }
      return batch.commit();
    }),
  );

  const changed = entries
    .filter(([id, score]) => score !== null && input.previous?.[id] !== score)
    .map(([id]) => `students/${id}/grades/${ref.id}`);
  for (const part of chunks(changed, 8)) void queueNotification(db, e.schoolId, 'grade', part);
  return ref.id;
}

/**
 * Supprime l'évaluation et les notes des élèves. On relit les notes existantes : les règles
 * refusent la suppression d'une note qui n'existe pas, ce qui ferait échouer tout le lot.
 */
export async function deleteEvaluation(db: Firestore, evaluation: Pick<Evaluation, 'id' | 'schoolId'>) {
  const snap = await getDocs(q.evaluationGrades(db, evaluation.schoolId, evaluation.id));
  const studentIds = snap.docs.map((d) => (d.data() as Grade).studentId);
  await Promise.all(
    chunks(studentIds, CHUNK).map((part) => {
      const batch = writeBatch(db);
      for (const id of part) batch.delete(refs.studentSubDoc(db, id, 'grades', evaluation.id));
      return batch.commit();
    }),
  );
  const batch = writeBatch(db);
  batch.delete(refs.schoolSubDoc(db, evaluation.schoolId, 'evaluations', evaluation.id));
  await batch.commit();
}

// ── Bulletins ──────────────────────────────────────────────────────────────

/** Publie les bulletins d'une classe (un document par élève) et prévient les parents. */
export async function publishBulletins(db: Firestore, bulletins: Bulletin[]) {
  if (!bulletins.length) return;
  await Promise.all(
    chunks(bulletins, CHUNK).map((part) => {
      const batch = writeBatch(db);
      for (const b of part) batch.set(refs.studentSubDoc(db, b.studentId, 'bulletins', b.id), withoutId(b));
      return batch.commit();
    }),
  );
  const paths = bulletins.map((b) => `students/${b.studentId}/bulletins/${b.id}`);
  for (const part of chunks(paths, 8)) void queueNotification(db, bulletins[0].schoolId, 'bulletin', part);
}

/** Retire un bulletin publié par erreur. */
export async function unpublishBulletins(db: Firestore, items: Pick<Bulletin, 'id' | 'studentId'>[]) {
  await Promise.all(
    chunks(items, CHUNK).map((part) => {
      const batch = writeBatch(db);
      for (const b of part) batch.delete(refs.studentSubDoc(db, b.studentId, 'bulletins', b.id));
      return batch.commit();
    }),
  );
}

// ── Horaire ────────────────────────────────────────────────────────────────

export async function saveTimetable(db: Firestore, t: Omit<Timetable, 'id' | 'updatedAt'>) {
  const slots = [...t.slots].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((s) => clean(s));
  await setDoc(refs.schoolSubDoc(db, t.schoolId, 'timetables', t.classId), { ...t, slots, updatedAt: nowISO() });
}
