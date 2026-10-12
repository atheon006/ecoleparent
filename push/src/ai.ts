// Import de documents avec Gemini (API Gemini de Google AI Studio).
//
// L'espace école envoie un document (PDF, photo, ou le texte d'un fichier Word ou Excel) ; Gemini
// en extrait des données structurées selon un schéma JSON strict. Rien n'est enregistré ici : la
// direction vérifie et corrige tout dans l'espace école avant l'ajout.

export type ImportKind = 'students' | 'classes' | 'timetable' | 'quiz';
export const IMPORT_KINDS: ImportKind[] = ['students', 'classes', 'timetable', 'quiz'];

export interface ImportInput {
  kind: ImportKind;
  /** Document binaire en base64 (PDF ou image). */
  file?: { mimeType: string; data: string };
  /** Texte d'un document (Word, Excel, CSV converti dans le navigateur). */
  text?: string;
  hints?: {
    /** Classes existantes de l'école, pour rapprocher les noms. */
    classes?: string[];
    level?: string;
    subject?: string;
    count?: number;
  };
}

export interface GeminiEnv {
  GEMINI_API_KEY?: string;
  /** Modèle Gemini ; par défaut l'alias du dernier modèle « Flash ». */
  GEMINI_MODEL?: string;
}

/** Types acceptés en pièce jointe par l'API Gemini (le reste est converti en texte côté navigateur). */
export const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

/** 15 Mo de base64 au plus (l'API accepte 20 Mo par requête). */
export const MAX_BASE64 = 15 * 1024 * 1024;
export const MAX_TEXT = 400_000;

const S = (description?: string) => ({ type: 'STRING', ...(description ? { description } : {}) });

const SCHEMAS: Record<ImportKind, unknown> = {
  students: {
    type: 'OBJECT',
    properties: {
      students: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            lastName: S('Nom de famille (souvent écrit en MAJUSCULES, premier mot du nom complet)'),
            firstName: S('Post-nom puis prénom'),
            gender: { type: 'STRING', enum: ['M', 'F', 'X'], description: 'M ou F si le document l’indique, X sinon' },
            birthDate: S('Date de naissance au format AAAA-MM-JJ, vide si absente ou incomplète'),
            className: S('Classe telle qu’écrite dans le document'),
            parentName: S('Nom du parent ou tuteur'),
            parentPhone: S('Téléphone du parent tel qu’écrit'),
            parentPhone2: S('Second téléphone éventuel'),
            uncertain: { type: 'ARRAY', items: S(), description: 'Champs illisibles ou douteux : lastName, firstName, gender, birthDate, className, parentPhone…' },
          },
          required: ['lastName', 'firstName', 'gender', 'birthDate', 'className', 'parentName', 'parentPhone', 'uncertain'],
        },
      },
      remark: S('Remarque courte sur le document (pages illisibles, colonnes manquantes), vide sinon'),
    },
    required: ['students', 'remark'],
  },
  classes: {
    type: 'OBJECT',
    properties: {
      classes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: S('Nom de la classe, ex. « 6e Primaire B », « 3e Scientifique A »'),
            level: { type: 'STRING', enum: ['Maternelle', 'Primaire', 'Secondaire', 'Humanités', 'Autre'] },
            subjects: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: S('Branche'),
                  max: { type: 'NUMBER', description: 'Maximum de points par période' },
                  examMax: { type: 'NUMBER', description: "Maximum à l'examen s'il est écrit, sinon 0" },
                },
                required: ['name', 'max', 'examMax'],
              },
            },
          },
          required: ['name', 'level', 'subjects'],
        },
      },
      remark: S(),
    },
    required: ['classes', 'remark'],
  },
  timetable: {
    type: 'OBJECT',
    properties: {
      slots: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            day: { type: 'INTEGER', description: '1 = lundi … 6 = samedi' },
            start: S('Heure de début HH:MM (24 h)'),
            end: S('Heure de fin HH:MM (24 h)'),
            subject: S('Cours, ou « Récréation » pour une pause'),
            teacher: S('Enseignant s’il est écrit, sinon vide'),
            room: S('Salle si elle est écrite, sinon vide'),
          },
          required: ['day', 'start', 'end', 'subject', 'teacher', 'room'],
        },
      },
      remark: S(),
    },
    required: ['slots', 'remark'],
  },
  quiz: {
    type: 'OBJECT',
    properties: {
      title: S('Titre court de l’interrogation'),
      questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: S(),
            answer: S('Réponse attendue, pour l’enseignant'),
            points: { type: 'NUMBER' },
          },
          required: ['question', 'answer', 'points'],
        },
      },
    },
    required: ['title', 'questions'],
  },
};

function prompt(input: ImportInput): string {
  const h = input.hints ?? {};
  const classes = h.classes?.length ? `Classes existantes de l'école : ${h.classes.slice(0, 80).join(', ')}.` : '';
  switch (input.kind) {
    case 'students':
      return [
        "Tu aides le secrétariat d'une école de la République démocratique du Congo à inscrire ses élèves.",
        "Le document est une liste d'élèves (registre, liste d'inscription, tableau). Extrais CHAQUE élève, sans en oublier ni en inventer.",
        'Un nom complet congolais se compose du nom, du post-nom et du prénom : lastName = le nom (souvent en majuscules, en premier) ; firstName = le post-nom suivi du prénom.',
        "Sexe : M ou F seulement s'il est indiqué dans le document ; sinon mets X et ajoute « gender » à uncertain. Ne devine jamais le sexe d'après le prénom.",
        'Dates au format AAAA-MM-JJ. Une date incomplète ou illisible : laisse vide et ajoute « birthDate » à uncertain.',
        'Recopie les téléphones tels quels. Un champ illisible : laisse-le vide et ajoute son nom à uncertain.',
        classes,
        'Réponds seulement avec le JSON demandé.',
      ].join('\n');
    case 'classes':
      return [
        "Tu aides la direction d'une école de la République démocratique du Congo à créer ses classes et leurs branches.",
        'Le document est un programme, une grille des maxima ou une liste de classes. Pour chaque classe, donne son nom, son niveau et ses branches avec le maximum de points par période (et le maximum d’examen seulement s’il est écrit, sinon 0).',
        "Si le document donne les branches d'un niveau sans nommer les classes, crée une seule classe portant le nom du niveau (ex. « 6e Primaire »).",
        "N'invente pas de maxima : un maximum absent vaut 10 et la remarque le signale.",
        classes,
        'Réponds seulement avec le JSON demandé.',
      ].join('\n');
    case 'timetable':
      return [
        "Le document est l'horaire hebdomadaire d'une classe (souvent une photo de l'horaire affiché).",
        'Donne chaque cours : jour (1 = lundi … 6 = samedi), heure de début et de fin au format HH:MM sur 24 heures, nom du cours, enseignant et salle s’ils sont écrits.',
        'Ajoute les récréations sous le nom « Récréation ». Si une heure est illisible, déduis-la des cours voisins et signale-le dans la remarque.',
        'Réponds seulement avec le JSON demandé.',
      ].join('\n');
    case 'quiz':
      return [
        `Tu aides un enseignant d'une école de la République démocratique du Congo${h.level ? ` (classe : ${h.level})` : ''}${h.subject ? `, branche : ${h.subject}` : ''}.`,
        `À partir du cours fourni, prépare une interrogation écrite de ${Math.min(Math.max(h.count ?? 10, 3), 25)} questions, en français simple et adapté à l'âge des élèves.`,
        "Varie les questions (définitions, questions de compréhension, petits exercices) et reste strictement dans le contenu du cours. Donne pour chaque question la réponse attendue et un nombre de points (total sur 20 si possible).",
        'Réponds seulement avec le JSON demandé.',
      ].join('\n');
  }
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Vérifie la demande avant tout appel (type, taille). */
export function checkInput(input: ImportInput) {
  if (!IMPORT_KINDS.includes(input.kind)) throw new ImportError("Type d'import inconnu.");
  if (!input.file && !input.text?.trim()) throw new ImportError('Le document est vide.');
  if (input.file) {
    if (!INLINE_TYPES.includes(input.file.mimeType)) throw new ImportError('Format non pris en charge : envoyez un PDF, une photo, ou un fichier Word ou Excel.');
    if (input.file.data.length > MAX_BASE64) throw new ImportError('Document trop lourd (15 Mo au plus).', 413);
  }
  if (input.text && input.text.length > MAX_TEXT) throw new ImportError('Document trop long : découpez-le en plusieurs fichiers.', 413);
}

/** Modèle de repli quand le modèle principal est saturé (plus léger, moins demandé). */
const FALLBACK_MODEL = 'gemini-flash-lite-latest';
const RETRY_DELAYS = [2000];
/** Au-delà, l'appel est abandonné (le parent ne doit pas attendre indéfiniment). */
const GEMINI_TIMEOUT_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Envoie le document à Gemini et renvoie le JSON structuré. */
export async function callGemini(env: GeminiEnv, input: ImportInput, fetcher: typeof fetch = fetch, delays = RETRY_DELAYS): Promise<unknown> {
  if (!env.GEMINI_API_KEY) throw new ImportError("L'import avec Gemini n'est pas encore activé : la clé API manque.", 503);
  checkInput(input);
  const parts: unknown[] = [{ text: prompt(input) }];
  if (input.file) parts.push({ inline_data: { mime_type: input.file.mimeType, data: input.file.data } });
  if (input.text) parts.push({ text: `Contenu du document :\n${input.text}` });
  // Réflexion limitée : inutile pour recopier une liste, utile un peu pour rédiger des questions.
  // Sans elle, la réponse arrive en quelques secondes au lieu de près d'une minute.
  const request = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMAS[input.kind],
      temperature: 0.1,
      thinkingConfig: { thinkingLevel: input.kind === 'quiz' ? 'low' : 'minimal' },
    },
  };
  const main = env.GEMINI_MODEL || 'gemini-flash-latest';
  // Saturation passagère (503/429) : une nouvelle tentative, puis le modèle léger.
  // Délai dépassé : directement le modèle léger (inutile d'attendre encore le même modèle).
  const attempts = [...delays.map(() => main), main, FALLBACK_MODEL];
  let last: ImportError | null = null;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0 && i <= delays.length) await sleep(delays[i - 1]);
    try {
      return normalize(input.kind, await generate(env.GEMINI_API_KEY, attempts[i], request, fetcher));
    } catch (e) {
      if (!(e instanceof ImportError) || (e.status !== 503 && e.status !== 429) || /clé API/.test(e.message)) throw e;
      last = e;
      if (/trop de temps/.test(e.message) && attempts[i] !== FALLBACK_MODEL) i = attempts.length - 2;
    }
  }
  throw last ?? new ImportError('Gemini ne répond pas. Réessayez dans quelques minutes.', 503);
}

interface GeminiRequest {
  contents: unknown[];
  generationConfig: Record<string, unknown>;
}

async function generate(key: string, model: string, request: GeminiRequest, fetcher: typeof fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') throw new ImportError('Gemini met trop de temps à répondre. Réessayez dans quelques minutes.', 503);
    throw e;
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (!res.ok) {
    const status = body.error?.status ?? '';
    // Modèle qui n'accepte pas ce réglage de réflexion (Google répond souvent un simple
    // « invalid argument ») : on renvoie la demande sans lui.
    if (res.status === 400 && !/API key/i.test(body.error?.message ?? '') && request.generationConfig.thinkingConfig) {
      const { thinkingConfig: _, ...generationConfig } = request.generationConfig;
      return generate(key, model, { ...request, generationConfig }, fetcher);
    }
    if (res.status === 400 && /API key/i.test(body.error?.message ?? '')) throw new ImportError('La clé API Gemini est refusée : vérifiez-la.', 503);
    if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') throw new ImportError('Gemini est saturé ou le quota est atteint. Réessayez dans quelques minutes.', 429);
    if (res.status === 503 || status === 'UNAVAILABLE') throw new ImportError('Gemini est très demandé en ce moment. Réessayez dans quelques minutes.', 503);
    throw new ImportError(`Gemini a refusé la demande (${res.status}) : ${(body.error?.message ?? '').slice(0, 200)}`, 502);
  }
  if (body.promptFeedback?.blockReason) throw new ImportError('Gemini a refusé de lire ce document.', 422);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text);
  } catch {
    const reason = body.candidates?.[0]?.finishReason;
    throw new ImportError(reason === 'MAX_TOKENS' ? 'Document trop long pour une seule analyse : découpez-le.' : 'Réponse de Gemini illisible. Réessayez.', 502);
  }
}

/** Remet les réponses au format attendu par l'espace école (ex. sexe inconnu « X » → vide). */
function normalize(kind: ImportKind, data: unknown): unknown {
  if (kind === 'students' && data && typeof data === 'object' && Array.isArray((data as { students?: unknown[] }).students)) {
    for (const s of (data as { students: { gender?: string }[] }).students) if (s.gender !== 'M' && s.gender !== 'F') s.gender = '';
  }
  return data;
}

let statusCache: { at: number; value: unknown } | null = null;

/**
 * État du branchement à Gemini (sans rien consommer : simple lecture de la fiche du modèle).
 * Ne révèle jamais la clé ; résultat gardé 10 minutes.
 */
export async function geminiStatus(env: GeminiEnv, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (statusCache && Date.now() - statusCache.at < 600_000) return statusCache.value;
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  let value: unknown;
  if (!env.GEMINI_API_KEY) value = { configured: false, model };
  else {
    const res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
    const body = (await res.json().catch(() => ({}))) as { displayName?: string; version?: string; thinking?: boolean; error?: { message?: string; status?: string } };
    if (res.ok) value = { configured: true, model, available: true, displayName: body.displayName, version: body.version, thinking: body.thinking ?? false };
    else {
      // Modèle introuvable : on propose les modèles « Flash » que la clé peut utiliser.
      let alternatives: string[] = [];
      if (res.status === 404) {
        const list = await fetcher('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
        const models = ((await list.json().catch(() => ({}))) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }).models ?? [];
        alternatives = models.filter((m) => /flash/.test(m.name) && m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace('models/', ''));
      }
      value = { configured: true, model, available: false, status: res.status, error: body.error?.status ?? '', alternatives };
    }
  }
  statusCache = { at: Date.now(), value };
  return value;
}

let selfTestCache: { at: number; value: unknown } | null = null;

const SAMPLES: Record<ImportKind, string> = {
  students: 'Liste 6e B : 1. KABIBI Mwamba Esther, F, née le 12/03/2015, parent Furaha Kabibi, 0970000000. 2. BAHATI Amani, M, 6e B, tél illisible.',
  classes: 'Programme 6e primaire : Français 40, Mathématiques 40, Sciences 20, Géographie 10.',
  timetable: 'Lundi 7h30-8h20 Français (M. Kambale), 8h20-9h10 Mathématiques, 10h00-10h20 récréation.',
  quiz: "Le cycle de l'eau : l'eau s'évapore avec la chaleur du soleil, se condense en nuages puis retombe en pluie.",
};

/** Essai réel des quatre types d'import sur de très courts textes (une série par heure au plus). */
export async function geminiSelfTest(env: GeminiEnv, only?: ImportKind, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!only && selfTestCache && Date.now() - selfTestCache.at < 3_600_000) return selfTestCache.value;
  const out: Record<string, unknown> = {};
  for (const kind of only ? [only] : IMPORT_KINDS) {
    const started = Date.now();
    try {
      const r = (await callGemini(env, { kind, text: SAMPLES[kind], hints: kind === 'quiz' ? { count: 3 } : { classes: ['6e Primaire B'] } }, fetcher)) as Record<string, unknown[]>;
      const list = r.students ?? r.classes ?? r.slots ?? r.questions ?? [];
      out[kind] = { ok: true, items: list.length, ms: Date.now() - started, sample: list[0] };
    } catch (e) {
      out[kind] = { ok: false, error: (e as Error).message };
    }
  }
  // Résultat gardé une heure s'il est bon, deux minutes sinon (pour pouvoir réessayer).
  const allOk = Object.values(out).every((v) => (v as { ok: boolean }).ok);
  if (!only) selfTestCache = { at: Date.now() - (allOk ? 0 : 3_480_000), value: out };
  return out;
}
