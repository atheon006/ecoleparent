import { getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

// Analyse d'un document par Gemini, via le Worker de ParentEcole (la clé API n'est jamais
// dans l'application). Le résultat est une proposition : l'espace école la fait vérifier.

export type ImportKind = 'students' | 'classes' | 'timetable' | 'quiz';

export interface AiStudent {
  lastName: string;
  firstName: string;
  gender: 'M' | 'F' | '';
  birthDate: string;
  className: string;
  parentName: string;
  parentPhone: string;
  parentPhone2?: string;
  uncertain: string[];
}

export interface AiClass {
  name: string;
  level: string;
  subjects: { name: string; max: number; examMax: number }[];
}

export interface AiSlot {
  day: number;
  start: string;
  end: string;
  subject: string;
  teacher: string;
  room: string;
}

export interface AiQuestion {
  question: string;
  answer: string;
  points: number;
}

export interface AiResults {
  students: { students: AiStudent[]; remark: string };
  classes: { classes: AiClass[]; remark: string };
  timetable: { slots: AiSlot[]; remark: string };
  quiz: { title: string; questions: AiQuestion[] };
}

export interface DocumentPayload {
  file?: { mimeType: string; data: string };
  text?: string;
}

export interface AiHints {
  classes?: string[];
  level?: string;
  subject?: string;
  count?: number;
}

const WORKER_URL = import.meta.env.VITE_PUSH_URL;

/** Vrai si l'analyse de documents est disponible dans cette version (adresse du Worker connue). */
export const aiImportAvailable = Boolean(WORKER_URL);

export async function analyzeDocument<K extends ImportKind>(
  db: Firestore,
  schoolId: string,
  kind: K,
  doc: DocumentPayload,
  hints?: AiHints,
): Promise<{ result: AiResults[K]; used: number; limit: number }> {
  if (!WORKER_URL) throw new Error("L'analyse de documents n'est pas configurée pour cette version.");
  const token = await getAuth(db.app).currentUser?.getIdToken();
  if (!token) throw new Error('Session expirée : reconnectez-vous.');
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL.replace(/\/$/, '')}/ai/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId, kind, ...doc, hints }),
    });
  } catch {
    throw new Error("Impossible de joindre le service d'analyse. Vérifiez la connexion internet.");
  }
  const body = (await res.json().catch(() => ({}))) as { result?: AiResults[K]; used?: number; limit?: number; error?: string };
  if (!res.ok || !body.result) throw new Error(body.error || `L'analyse a échoué (${res.status}).`);
  return { result: body.result, used: body.used ?? 0, limit: body.limit ?? 0 };
}
