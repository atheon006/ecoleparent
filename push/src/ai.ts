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
            gender: { type: 'STRING', enum: ['M', 'F', ''] },
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
        "Sexe : M ou F seulement s'il est indiqué dans le document ; sinon laisse vide et ajoute « gender » à uncertain. Ne devine jamais le sexe d'après le prénom.",
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

/** Envoie le document à Gemini et renvoie le JSON structuré. */
export async function callGemini(env: GeminiEnv, input: ImportInput, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!env.GEMINI_API_KEY) throw new ImportError("L'import avec Gemini n'est pas encore activé : la clé API manque.", 503);
  checkInput(input);
  const parts: unknown[] = [{ text: prompt(input) }];
  if (input.file) parts.push({ inline_data: { mime_type: input.file.mimeType, data: input.file.data } });
  if (input.text) parts.push({ text: `Contenu du document :\n${input.text}` });
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMAS[input.kind], temperature: 0.1 },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (!res.ok) {
    const status = body.error?.status ?? '';
    if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') throw new ImportError('Gemini est saturé ou le quota est atteint. Réessayez dans quelques minutes.', 429);
    if (res.status === 400 && /API key/i.test(body.error?.message ?? '')) throw new ImportError('La clé API Gemini est refusée : vérifiez-la.', 503);
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
