// Envoi des notifications push de ParentEcole, sur l'offre gratuite de Cloudflare Workers
// (sans le plan Blaze de Firebase).
//
// Le site de l'école dépose dans `notifications/{id}` une demande qui pointe vers ce qui vient
// d'être enregistré (absence, paiement, conduite, devoir, communiqué). Ce Worker relit ces
// documents avec un compte de service, vérifie qu'ils appartiennent bien à l'école, écrit le
// message et l'envoie par Firebase Cloud Messaging aux parents concernés.
// Il passe chaque minute (cron) et tout de suite quand le site l'appelle sur POST /kick.

import { ImportError, callGemini, checkInput, type ImportInput } from './ai';

export interface Env {
  PROJECT_ID: string;
  PARENT_URL: string;
  ALLOWED_ORIGINS: string;
  /** Clé JSON du compte de service (secret : `wrangler secret put SERVICE_ACCOUNT`). */
  SERVICE_ACCOUNT: string;
  /**
   * Tests seulement : « 127.0.0.1:8080 » fait lire l'émulateur Firestore, et les messages sont
   * notés dans `globalThis.__peSent` au lieu de partir vers FCM.
   */
  FIRESTORE_EMULATOR_HOST?: string;
  /** Clé de l'API Gemini (secret : `wrangler secret put GEMINI_API_KEY`) pour l'import de documents. */
  GEMINI_API_KEY?: string;
  /** Modèle Gemini (facultatif, par défaut « gemini-flash-latest »). */
  GEMINI_MODEL?: string;
  /** Analyses de documents permises par école et par jour (40 par défaut). */
  AI_DAILY_LIMIT?: string;
}

type Kind =
  | 'attendance'
  | 'payment'
  | 'conduct'
  | 'homework'
  | 'announcement'
  | 'grade'
  | 'bulletin'
  | 'permission'
  | 'event'
  | 'appointment'
  | 'request';

/** Catégorie de préférence du parent (Paramètres › Notifications de l'app). */
const CATEGORY: Record<Kind, string> = {
  attendance: 'presences',
  payment: 'frais',
  conduct: 'conduite',
  homework: 'devoirs',
  announcement: 'annonces',
  grade: 'notes',
  bulletin: 'notes',
  permission: 'agenda',
  event: 'agenda',
  appointment: 'agenda',
  request: 'agenda',
};

/** Un envoi : un appareil (jeton FCM) et le message qui lui est destiné. */
interface Target {
  t: string; // jeton
  u: string; // compte parent
  ti: string; // titre
  b: string; // texte
  k: Kind;
  s: string; // élève concerné ('' pour toute l'école)
}

interface Message {
  studentId: string;
  title: string;
  body: string;
  kind: Kind;
  /** Envoyé même pendant les heures calmes (communiqué urgent). */
  urgent?: boolean;
}

// L'offre gratuite autorise 50 requêtes sortantes par exécution : on s'arrête avant, le reste
// part à l'exécution suivante (une minute plus tard au plus).
const MAX_CALLS = 46;
const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/kick' && req.method === 'POST') {
      const auth = req.headers.get('authorization') ?? '';
      const ok = auth.startsWith('Bearer ') && !!(await verifyIdToken(env, auth.slice(7)).catch(() => null));
      if (!ok) return new Response('Non autorisé', { status: 401, headers: cors });
      ctx.waitUntil(processOutbox(env).catch((e) => console.error('kick', e)));
      return new Response(null, { status: 202, headers: cors });
    }
    if (url.pathname === '/ai/import' && req.method === 'POST') return handleImport(req, env, cors);
    if (url.pathname === '/') return new Response('ParentEcole · notifications : en service\n');
    return new Response('Introuvable\n', { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processOutbox(env).catch((e) => console.error('cron', e)));
  },
};

function corsHeaders(req: Request, env: Env): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};
}

// ── Traitement de la boîte d'envoi ───────────────────────────────────────────

export async function processOutbox(env: Env) {
  const api = new Api(env);
  const pending = await api.query({
    from: [{ collectionId: 'notifications' }],
    where: eq('status', 'pending'),
    limit: 5,
  });
  for (const doc of pending) {
    if (api.left() < 8) break;
    await processOne(api, doc);
  }
}

async function processOne(api: Api, doc: FsDoc) {
  const n = data(doc);
  // On « prend » la demande : si une autre exécution l'a prise entre-temps, la condition échoue.
  const claimedAt = new Date().toISOString();
  const claimed = await api.update(doc.name, { status: 'sending', claimedAt }, doc.updateTime);
  if (!claimed) return;
  try {
    const targets: Target[] = Array.isArray(n.targets) && n.resolved ? (n.targets as Target[]) : await resolve(api, n);
    const now = targets.slice(0, Math.max(0, api.left() - 2));
    const rest = targets.slice(now.length);
    const stale: Target[] = [];
    let sent = typeof n.sent === 'number' ? n.sent : 0;
    const results = await Promise.all(now.map((t) => api.send(t)));
    results.forEach((r, i) => {
      if (r === 'sent') sent++;
      else if (r === 'stale') stale.push(now[i]);
    });
    const fields = rest.length
      ? { status: 'pending', resolved: true, targets: rest, sent }
      : { status: 'sent', resolved: true, targets: [], sent, sentAt: new Date().toISOString() };
    await api.commit([updateWrite(doc.name, fields), ...removeTokens(api, stale)]);
  } catch (e) {
    console.error('notification', doc.name, e);
    await api.update(doc.name, { status: 'error', error: String(e).slice(0, 500) }).catch(() => undefined);
  }
}

/** Sous-collection des élèves concernée par chaque type de message « par élève ». */
const STUDENT_SUB: Partial<Record<Kind, string>> = {
  attendance: 'attendance',
  payment: 'payments',
  conduct: 'conduct',
  grade: 'grades',
  bulletin: 'bulletins',
  request: 'requests',
};

/** Collection de l'école pour les messages destinés à une partie de l'école. */
const SCHOOL_SUB: Partial<Record<Kind, string>> = {
  homework: 'homework',
  announcement: 'announcements',
  permission: 'permissions',
  event: 'events',
  appointment: 'slots',
};

const REQUEST_LABELS: Record<string, string> = {
  attestation: 'attestation de fréquentation',
  pickup: 'personne autorisée',
  info: 'correction d’information',
};

/** Relit les documents visés et prépare un message par parent et par appareil. */
async function resolve(api: Api, n: Record<string, unknown>): Promise<Target[]> {
  const schoolId = String(n.schoolId ?? '');
  const kind = n.kind as Kind;
  const paths = (Array.isArray(n.paths) ? n.paths : []).map(String).slice(0, 10);
  if (!schoolId || !paths.length || !(kind in CATEGORY)) return [];

  // Messages par élève, pour certains parents, ou pour une partie de l'école.
  const perStudent: Message[] = [];
  const perUid = new Map<string, Message[]>();
  let broadcast: (Message & { classIds: string[] }) | null = null;

  const studentSub = STUDENT_SUB[kind];
  const schoolSub = SCHOOL_SUB[kind];

  if (studentSub) {
    const wanted = paths
      .map((path) => path.match(/^students\/([^/]+)\/([^/]+)\/([^/]+)$/))
      .filter((m): m is RegExpMatchArray => !!m && m[2] === studentSub);
    if (!wanted.length) return [];
    const docs = await api.batchGet(wanted.map((m) => m[0]), []);
    const byPath = new Map(docs.map((d) => [d.name.slice(api.root.length + 1), data(d)]));
    let currency = '$';
    if (kind === 'payment') {
      const school = await api.get(`schools/${schoolId}`);
      currency = String((school && data(school).currency) || '$');
    }
    // Les notes ne portent pas le nom de l'élève : on le lit sur sa fiche.
    const names = new Map<string, string>();
    if (kind === 'grade') {
      const students = await api.batchGet([...new Set(wanted.map((m) => `students/${m[1]}`))], ['firstName']);
      for (const st of students) names.set(st.name.split('/').pop()!, String(data(st).firstName ?? ''));
    }
    for (const m of wanted) {
      const d = byPath.get(m[0]);
      if (!d || d.schoolId !== schoolId) continue; // absent ou pas de cette école : ignoré
      const studentId = m[1];
      const name = names.get(studentId) || firstName(String(d.studentName ?? ''));
      const msg = studentMessage(kind, d, name, currency);
      if (msg) perStudent.push({ studentId, kind, ...msg });
    }
  } else if (schoolSub) {
    const m = paths[0].match(/^schools\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!m || m[1] !== schoolId || m[2] !== schoolSub) return [];
    const doc = await api.get(paths[0]);
    if (!doc) return [];
    const d = data(doc);
    const classIds = (Array.isArray(d.classIds) ? d.classIds : []).map(String);
    if (kind === 'homework') {
      broadcast = { studentId: '', kind, title: `Nouveau devoir de ${d.subject}`, body: String(d.title ?? ''), classIds: [String(d.classId)] };
    } else if (kind === 'announcement') {
      const urgent = d.category === 'Urgent';
      broadcast = { studentId: '', kind, urgent, title: urgent ? `Urgent : ${d.title}` : String(d.title ?? ''), body: String(d.content ?? '').slice(0, 180), classIds };
    } else if (kind === 'permission') {
      broadcast = { studentId: '', kind, title: `Autorisation à signer : ${d.title}`, body: `Sortie le ${frDate(String(d.date))} · répondre avant le ${frDate(String(d.deadline))}`, classIds };
    } else if (kind === 'event') {
      const when = [frDate(String(d.date)), d.time ? `à ${d.time}` : '', d.endDate && d.endDate !== d.date ? `au ${frDate(String(d.endDate))}` : ''].filter(Boolean).join(' ');
      broadcast = { studentId: '', kind, title: `Agenda : ${d.title}`, body: `${d.category ?? ''} · ${when}${d.place ? ` · ${d.place}` : ''}`.replace(/^ · /, ''), classIds };
    } else if (kind === 'appointment' && (d.status === 'confirmed' || d.status === 'declined') && d.bookedBy) {
      // Seul le parent qui a demandé le créneau est prévenu.
      const confirmed = d.status === 'confirmed';
      perUid.set(String(d.bookedBy), [
        {
          studentId: String(d.studentId ?? ''),
          kind,
          title: confirmed ? `Rendez-vous confirmé avec ${d.teacherName}` : `Rendez-vous décliné par ${d.teacherName}`,
          body: `${frDate(String(d.date))} à ${d.start}${d.place ? ` · ${d.place}` : ''}${confirmed ? '' : ' · choisissez un autre créneau'}`,
        },
      ]);
    }
  }

  // Comptes parents concernés.
  const byUid = new Map<string, Message[]>(perUid);
  if (perStudent.length) {
    for (const msg of perStudent) {
      if (api.left() < 6) break;
      const links = await api.list(`students/${msg.studentId}/parents`, ['uid']);
      for (const l of links) {
        const uid = String(data(l).uid ?? l.name.split('/').pop());
        byUid.set(uid, [...(byUid.get(uid) ?? []), msg]);
      }
    }
  } else if (broadcast) {
    const links = (
      await api.query(
        { from: [{ collectionId: 'parents', allDescendants: true }], where: eq('schoolId', schoolId), select: { fields: [{ fieldPath: 'uid' }, { fieldPath: 'studentId' }] } },
      )
    ).map(data);
    let allowed: Set<string> | null = null;
    if (broadcast.classIds.length) {
      const students = await api.query({
        from: [{ collectionId: 'students' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [eq('schoolId', schoolId), { fieldFilter: { field: { fieldPath: 'classId' }, op: 'IN', value: encode(broadcast.classIds.slice(0, 30)) } }],
          },
        },
        select: { fields: [{ fieldPath: 'classId' }] },
      });
      allowed = new Set(students.map((s) => s.name.split('/').pop()!));
    }
    const { classIds: _c, ...msg } = broadcast;
    for (const l of links) {
      if (allowed && !allowed.has(String(l.studentId))) continue;
      byUid.set(String(l.uid), [msg]);
    }
  }
  if (!byUid.size) return [];

  // Appareils de chaque parent, selon ses préférences (catégories coupées, heures calmes).
  const users = await api.batchGet([...byUid.keys()].map((uid) => `users/${uid}`), ['fcmTokens', 'prefs']);
  const targets: Target[] = [];
  for (const u of users) {
    const uid = u.name.split('/').pop()!;
    const d = data(u);
    const prefs = (d.prefs ?? {}) as { notif?: Record<string, boolean>; quiet?: boolean; tzOffset?: number };
    const tokens = (d.fcmTokens as unknown[] | undefined) ?? [];
    for (const msg of byUid.get(uid) ?? []) {
      if (prefs.notif?.[CATEGORY[msg.kind]] === false) continue;
      if (prefs.quiet && !msg.urgent && isQuietHour(prefs.tzOffset)) continue;
      for (const token of tokens) {
        targets.push({ t: String(token), u: uid, ti: msg.title.slice(0, 120), b: msg.body.slice(0, 240), k: msg.kind, s: msg.studentId });
      }
    }
  }
  return targets;
}

/** Texte d'un message qui concerne un élève (null : rien à envoyer). */
function studentMessage(kind: Kind, d: Record<string, unknown>, name: string, currency: string): { title: string; body: string } | null {
  switch (kind) {
    case 'attendance':
      if (d.status !== 'absent' && d.status !== 'late') return null;
      return {
        title: d.status === 'absent' ? `Absence de ${name}` : `Retard de ${name}`,
        body: String(d.reason || `Signalé par ${d.recordedByName ?? 'l’école'} lors de l'appel.`),
      };
    case 'payment':
      return { title: `Paiement reçu : ${d.amount} ${currency}`, body: `${d.feeName} · reçu ${d.reference}` };
    case 'conduct':
      return { title: `${d.type} · ${name}`, body: String(d.title ?? '') };
    case 'grade':
      if (d.score === null || d.score === undefined) return null;
      return { title: `${name} : ${fmt(Number(d.score))}/${fmt(Number(d.max))} en ${d.subjectName}`, body: String(d.title ?? 'Nouvelle note') };
    case 'bulletin':
      return {
        title: `Bulletin de ${name} : ${d.periodLabel}`,
        body: `${fmt(Number(d.percent))} %${d.rank ? ` · ${d.rank === 1 ? '1re' : `${d.rank}e`} place sur ${d.classSize}` : ''}`,
      };
    case 'request':
      if (d.status !== 'done' && d.status !== 'rejected') return null;
      return {
        title: `${d.status === 'done' ? 'Demande traitée' : 'Demande refusée'} : ${REQUEST_LABELS[String(d.type)] ?? 'demande'}`,
        body: String(d.answer || `Pour ${name}`),
      };
    default:
      return null;
  }
}

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : '—');

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 2026-10-17 » → « samedi 17 octobre ». */
function frDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]} ${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`;
}

/** Heures calmes : de 21 h à 6 h à l'heure du téléphone du parent (décalage en minutes). */
export function isQuietHour(tzOffset: number | undefined, now = new Date()): boolean {
  const offset = typeof tzOffset === 'number' && Math.abs(tzOffset) <= 14 * 60 ? tzOffset : 60; // RDC par défaut
  const minutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + offset + 24 * 60) % (24 * 60);
  return minutes >= 21 * 60 || minutes < 6 * 60;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || 'Votre enfant';

/** Retire les jetons d'appareils qui n'existent plus (application désinstallée). */
function removeTokens(api: Api, stale: Target[]) {
  const byUid = new Map<string, string[]>();
  for (const t of stale) byUid.set(t.u, [...(byUid.get(t.u) ?? []), t.t]);
  return [...byUid].map(([uid, tokens]) => ({
    transform: {
      document: `${api.root}/users/${uid}`,
      fieldTransforms: [{ fieldPath: 'fcmTokens', removeAllFromArray: { values: tokens.map((t) => ({ stringValue: t })) } }],
    },
  }));
}

// ── Import de documents avec Gemini (espace école) ─────────────────────────────

function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
}

/**
 * POST /ai/import : réservé au personnel de l'école (jeton Firebase avec second facteur).
 * La direction peut tout importer ; un professeur seulement préparer une interrogation.
 */
export async function handleImport(req: Request, env: Env, cors: HeadersInit): Promise<Response> {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? await verifyIdToken(env, auth.slice(7)).catch(() => null) : null;
    if (!token?.email || !token.email_verified || !token.firebase?.sign_in_second_factor) return json({ error: 'Connexion du personnel requise.' }, 401, cors);
    const email = token.email.toLowerCase();

    const body = (await req.json().catch(() => null)) as (ImportInput & { schoolId?: string }) | null;
    if (!body || typeof body.schoolId !== 'string' || !body.schoolId) return json({ error: 'Demande incomplète.' }, 400, cors);
    checkInput(body);

    const api = new Api(env);
    const member = await api.get(`members/${email}`);
    const m = member ? data(member) : null;
    const isSuper = !m && !!(await api.get(`superadmins/${email}`));
    const sameSchool = !!m && m.schoolId === body.schoolId && m.active === true;
    const allowed = isSuper || (sameSchool && (m!.role === 'admin' || (m!.role === 'professeur' && body.kind === 'quiz')));
    if (!allowed) return json({ error: "Vous n'avez pas le droit d'importer pour cette école." }, 403, cors);

    // Plafond quotidien par école : maîtrise du coût et des abus.
    const day = new Date().toISOString().slice(0, 10);
    const usagePath = `aiUsage/${body.schoolId}_${day}`;
    const usage = await api.get(usagePath);
    const used = usage ? Number(data(usage).count ?? 0) : 0;
    const limit = Number(env.AI_DAILY_LIMIT ?? 40);
    if (used >= limit) return json({ error: `Limite de ${limit} analyses par jour atteinte pour l'école. Réessayez demain.` }, 429, cors);

    const result = await callGemini(env, body);
    await api
      .commit([
        {
          transform: {
            document: `${api.root}/${usagePath}`,
            fieldTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }],
          },
        },
      ])
      .catch((e) => console.warn('aiUsage', e));
    return json({ result, used: used + 1, limit }, 200, cors);
  } catch (e) {
    if (e instanceof ImportError) return json({ error: e.message }, e.status, cors);
    console.error('ai/import', e);
    return json({ error: "L'analyse a échoué. Réessayez." }, 500, cors);
  }
}

// ── Accès aux API Google (Firestore REST, FCM v1) ────────────────────────────

interface FsValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
}

interface FsDoc {
  name: string;
  fields?: Record<string, FsValue>;
  updateTime?: string;
}

function decode(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue?.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  return null;
}

function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, encode(x)])) } };
}

const data = (d: FsDoc): Record<string, unknown> => Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decode(v)]));

const eq = (field: string, value: unknown) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encode(value) } });

function updateWrite(name: string, fields: Record<string, unknown>, updateTime?: string) {
  return {
    update: { name, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])) },
    updateMask: { fieldPaths: Object.keys(fields) },
    ...(updateTime ? { currentDocument: { updateTime } } : {}),
  };
}

let cachedToken: { token: string; exp: number } | null = null;

class Api {
  calls = 0;
  readonly base: string;
  readonly root: string;

  constructor(readonly env: Env) {
    this.root = `projects/${env.PROJECT_ID}/databases/(default)/documents`;
    this.base = env.FIRESTORE_EMULATOR_HOST
      ? `http://${env.FIRESTORE_EMULATOR_HOST}/v1/${this.root}`
      : `https://firestore.googleapis.com/v1/${this.root}`;
  }

  left() {
    return MAX_CALLS - this.calls;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.left() <= 0) throw new Error('Plus de requêtes disponibles pour cette exécution.');
    const token = await this.accessToken();
    this.calls++;
    return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.call(url, init);
    if (!res.ok) throw new Error(`${res.status} ${url.replace(this.base, '')} : ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<T>;
  }

  async get(path: string): Promise<FsDoc | null> {
    const res = await this.call(`${this.base}/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} get ${path}`);
    return res.json() as Promise<FsDoc>;
  }

  async list(path: string, fields: string[]): Promise<FsDoc[]> {
    const mask = fields.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const out = await this.json<{ documents?: FsDoc[] }>(`${this.base}/${path}?pageSize=50&${mask}`);
    return out.documents ?? [];
  }

  async query(structuredQuery: Record<string, unknown>): Promise<FsDoc[]> {
    const rows = await this.json<{ document?: FsDoc }[]>(`${this.base}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
    return rows.filter((r) => r.document).map((r) => r.document!);
  }

  async batchGet(paths: string[], fields: string[]): Promise<FsDoc[]> {
    const out: FsDoc[] = [];
    for (let i = 0; i < paths.length; i += 100) {
      const rows = await this.json<{ found?: FsDoc }[]>(`${this.base}:batchGet`, {
        method: 'POST',
        // Sans liste de champs : documents entiers.
        body: JSON.stringify({ documents: paths.slice(i, i + 100).map((p) => `${this.root}/${p}`), ...(fields.length ? { mask: { fieldPaths: fields } } : {}) }),
      });
      out.push(...rows.filter((r) => r.found).map((r) => r.found!));
    }
    return out;
  }

  /** Met à jour des champs ; avec `updateTime`, seulement si le document n'a pas changé (sinon null). */
  async update(name: string, fields: Record<string, unknown>, updateTime?: string): Promise<boolean> {
    const res = await this.call(`${this.base}:commit`, { method: 'POST', body: JSON.stringify({ writes: [updateWrite(name, fields, updateTime)] }) });
    if (res.ok) return true;
    const text = await res.text();
    if (/FAILED_PRECONDITION|ABORTED/.test(text)) return false;
    throw new Error(`${res.status} update ${name} : ${text.slice(0, 200)}`);
  }

  async commit(writes: unknown[]) {
    await this.json(`${this.base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
  }

  /** Envoie un message FCM ; 'stale' si le jeton n'est plus valable. */
  async send(t: Target): Promise<'sent' | 'stale' | 'failed'> {
    if (this.env.FIRESTORE_EMULATOR_HOST) {
      const g = globalThis as { __peSent?: Target[] };
      (g.__peSent ??= []).push(t);
      return t.t.startsWith('perime') ? 'stale' : 'sent';
    }
    const res = await this.call(`https://fcm.googleapis.com/v1/projects/${this.env.PROJECT_ID}/messages:send`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          token: t.t,
          notification: { title: t.ti, body: t.b },
          data: { kind: t.k, studentId: t.s },
          android: { priority: 'HIGH', notification: { channel_id: 'ecole', color: '#1E4A38', icon: 'ic_stat_notify' } },
          webpush: {
            notification: { icon: `${this.env.PARENT_URL}/icon-192.png`, badge: `${this.env.PARENT_URL}/icon-192.png` },
            fcm_options: { link: `${this.env.PARENT_URL}/` },
          },
        },
      }),
    });
    if (res.ok) return 'sent';
    const text = await res.text();
    if (res.status === 404 || /UNREGISTERED|SENDER_ID_MISMATCH|not a valid FCM registration token/i.test(text)) return 'stale';
    console.warn('fcm', res.status, text.slice(0, 300));
    return 'failed';
  }

  private async accessToken(): Promise<string> {
    if (this.env.FIRESTORE_EMULATOR_HOST) return 'owner';
    if (cachedToken && cachedToken.exp > Date.now() + 120_000) return cachedToken.token;
    const sa = JSON.parse(this.env.SERVICE_ACCOUNT) as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
    this.calls++;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${b64url(sig)}`,
    });
    if (!res.ok) throw new Error(`Jeton Google refusé : ${res.status} ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: out.access_token, exp: Date.now() + out.expires_in * 1000 };
    return out.access_token;
  }
}

// ── Vérification du jeton Firebase de la personne qui appelle /kick ─────────

let jwks: { keys: (JsonWebKey & { kid?: string })[]; exp: number } | null = null;

interface IdTokenPayload {
  aud?: string;
  iss?: string;
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_second_factor?: string };
}

/** Vérifie la signature d'un jeton Firebase ; renvoie son contenu, ou null s'il n'est pas valable. */
async function verifyIdToken(env: Env, token: string): Promise<IdTokenPayload | null> {
  const [h, p, s] = token.split('.');
  if (!h || !p) return null;
  const header = JSON.parse(fromB64url(h)) as { kid?: string; alg?: string };
  const payload = JSON.parse(fromB64url(p)) as IdTokenPayload;
  if (payload.aud !== env.PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.PROJECT_ID}`) return null;
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null;
  // Tests seulement : l'émulateur d'authentification signe ses jetons avec « none ».
  if (env.FIRESTORE_EMULATOR_HOST && header.alg === 'none') return payload;
  if (header.alg !== 'RS256' || !s) return null;
  if (!jwks || jwks.exp < Date.now()) {
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    jwks = { keys: ((await res.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys, exp: Date.now() + maxAge * 1000 };
  }
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  return ok ? payload : null;
}

// ── Encodages ────────────────────────────────────────────────────────────────

function b64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const fromB64url = (s: string) => new TextDecoder().decode(b64urlBytes(s));

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}
