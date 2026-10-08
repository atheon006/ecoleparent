// Envoi des notifications push de ParentEcole, sur l'offre gratuite de Cloudflare Workers
// (sans le plan Blaze de Firebase).
//
// Le site de l'école dépose dans `notifications/{id}` une demande qui pointe vers ce qui vient
// d'être enregistré (absence, paiement, conduite, devoir, communiqué). Ce Worker relit ces
// documents avec un compte de service, vérifie qu'ils appartiennent bien à l'école, écrit le
// message et l'envoie par Firebase Cloud Messaging aux parents concernés.
// Il passe chaque minute (cron) et tout de suite quand le site l'appelle sur POST /kick.

export interface Env {
  PROJECT_ID: string;
  PARENT_URL: string;
  ALLOWED_ORIGINS: string;
  /** Clé JSON du compte de service (secret : `wrangler secret put SERVICE_ACCOUNT`). */
  SERVICE_ACCOUNT: string;
}

type Kind = 'attendance' | 'payment' | 'conduct' | 'homework' | 'announcement';

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
      const ok = auth.startsWith('Bearer ') && (await verifyIdToken(env, auth.slice(7)).catch(() => false));
      if (!ok) return new Response('Non autorisé', { status: 401, headers: cors });
      ctx.waitUntil(processOutbox(env).catch((e) => console.error('kick', e)));
      return new Response(null, { status: 202, headers: cors });
    }
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
        'Access-Control-Allow-Headers': 'Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};
}

// ── Traitement de la boîte d'envoi ───────────────────────────────────────────

async function processOutbox(env: Env) {
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

/** Relit les documents visés et prépare un message par parent et par appareil. */
async function resolve(api: Api, n: Record<string, unknown>): Promise<Target[]> {
  const schoolId = String(n.schoolId ?? '');
  const kind = n.kind as Kind;
  const paths = (Array.isArray(n.paths) ? n.paths : []).map(String).slice(0, 10);
  if (!schoolId || !paths.length) return [];

  // Messages par élève (absence, paiement, conduite) ou pour une partie de l'école.
  const perStudent: Message[] = [];
  let broadcast: { title: string; body: string; classIds: string[] } | null = null;

  if (kind === 'attendance' || kind === 'payment' || kind === 'conduct') {
    const sub = { attendance: 'attendance', payment: 'payments', conduct: 'conduct' }[kind];
    let currency = '$';
    if (kind === 'payment') {
      const school = await api.get(`schools/${schoolId}`);
      currency = String((school && data(school).currency) || '$');
    }
    for (const path of paths) {
      const m = path.match(/^students\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (!m || m[2] !== sub || api.left() < 10) continue;
      const doc = await api.get(path);
      if (!doc) continue;
      const d = data(doc);
      if (d.schoolId !== schoolId) continue; // pas de cette école : ignoré
      const studentId = m[1];
      const name = firstName(String(d.studentName ?? ''));
      if (kind === 'attendance') {
        if (d.status !== 'absent' && d.status !== 'late') continue;
        perStudent.push({
          studentId,
          kind,
          title: d.status === 'absent' ? `Absence de ${name}` : `Retard de ${name}`,
          body: String(d.reason || `Signalé par ${d.recordedByName ?? 'l’école'} lors de l'appel.`),
        });
      } else if (kind === 'payment') {
        perStudent.push({ studentId, kind, title: `Paiement reçu : ${d.amount} ${currency}`, body: `${d.feeName} · reçu ${d.reference}` });
      } else {
        perStudent.push({ studentId, kind, title: `${d.type} · ${name}`, body: String(d.title ?? '') });
      }
    }
  } else if (kind === 'homework' || kind === 'announcement') {
    const sub = kind === 'homework' ? 'homework' : 'announcements';
    const m = paths[0].match(/^schools\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!m || m[1] !== schoolId || m[2] !== sub) return [];
    const doc = await api.get(paths[0]);
    if (!doc) return [];
    const d = data(doc);
    if (kind === 'homework') {
      broadcast = { title: `Nouveau devoir de ${d.subject}`, body: String(d.title ?? ''), classIds: [String(d.classId)] };
    } else {
      const title = d.category === 'Urgent' ? `Urgent : ${d.title}` : String(d.title ?? '');
      broadcast = { title, body: String(d.content ?? '').slice(0, 180), classIds: (Array.isArray(d.classIds) ? d.classIds : []).map(String) };
    }
  }

  // Comptes parents concernés.
  const byUid = new Map<string, Message[]>();
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
    const msg: Message = { studentId: '', kind, title: broadcast.title, body: broadcast.body };
    for (const l of links) {
      if (allowed && !allowed.has(String(l.studentId))) continue;
      byUid.set(String(l.uid), [msg]);
    }
  }
  if (!byUid.size) return [];

  // Appareils de chaque parent.
  const users = await api.batchGet([...byUid.keys()].map((uid) => `users/${uid}`), ['fcmTokens']);
  const targets: Target[] = [];
  for (const u of users) {
    const uid = u.name.split('/').pop()!;
    const tokens = (data(u).fcmTokens as unknown[] | undefined) ?? [];
    for (const token of tokens) {
      for (const msg of byUid.get(uid) ?? []) {
        targets.push({ t: String(token), u: uid, ti: msg.title.slice(0, 120), b: msg.body.slice(0, 240), k: msg.kind, s: msg.studentId });
      }
    }
  }
  return targets;
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
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
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
        body: JSON.stringify({ documents: paths.slice(i, i + 100).map((p) => `${this.root}/${p}`), mask: { fieldPaths: fields } }),
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

async function verifyIdToken(env: Env, token: string): Promise<boolean> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const header = JSON.parse(fromB64url(h)) as { kid?: string; alg?: string };
  const payload = JSON.parse(fromB64url(p)) as { aud?: string; iss?: string; exp?: number; sub?: string };
  if (header.alg !== 'RS256' || payload.aud !== env.PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.PROJECT_ID}`) return false;
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return false;
  if (!jwks || jwks.exp < Date.now()) {
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    jwks = { keys: ((await res.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys, exp: Date.now() + maxAge * 1000 };
  }
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
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
