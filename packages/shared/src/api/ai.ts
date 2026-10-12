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

/** Au-delà, on abandonne : le serveur a lui-même essayé deux modèles (45 s chacun au plus). */
const CLIENT_TIMEOUT_MS = 150_000;

export async function analyzeDocument<K extends ImportKind>(
  db: Firestore,
  schoolId: string,
  kind: K,
  doc: DocumentPayload,
  hints?: AiHints,
  signal?: AbortSignal,
): Promise<{ result: AiResults[K]; used: number; limit: number }> {
  if (!WORKER_URL) throw new Error("L'analyse de documents n'est pas configurée pour cette version.");
  const token = await getAuth(db.app).currentUser?.getIdToken();
  if (!token) throw new Error('Session expirée : reconnectez-vous.');
  // Délai maximal et annulation, sans AbortSignal.any (absent des navigateurs un peu anciens).
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, CLIENT_TIMEOUT_MS);
  const cancel = () => ctrl.abort();
  signal?.addEventListener('abort', cancel);
  if (signal?.aborted) ctrl.abort();
  let res: Response;
  let body: { result?: AiResults[K]; used?: number; limit?: number; error?: string };
  try {
    res = await fetch(`${WORKER_URL.replace(/\/$/, '')}/ai/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId, kind, ...doc, hints }),
      signal: ctrl.signal,
    });
    body = await res.json().catch((e: unknown) => {
      if (ctrl.signal.aborted) throw e;
      return {};
    });
  } catch {
    if (timedOut) throw new Error('Gemini met trop de temps à répondre. Réessayez dans quelques minutes, ou avec un document plus court.');
    if (signal?.aborted) throw new Error('Analyse annulée.');
    throw new Error("Impossible de joindre le service d'analyse. Vérifiez la connexion internet.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  if (!res.ok || !body.result) throw new Error(body.error || `L'analyse a échoué (${res.status}).`);
  return { result: body.result, used: body.used ?? 0, limit: body.limit ?? 0 };
}
