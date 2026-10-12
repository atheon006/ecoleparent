// Route d'import avec Gemini du Worker (POST /ai/import), contre l'émulateur Firestore :
// qui a le droit d'importer quoi, plafond quotidien, clé absente. Gemini est simulé.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleImport } from '../push/src/index';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'demo-ai-test';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const env = { PROJECT_ID: PROJECT, PARENT_URL: '', ALLOWED_ORIGINS: '', SERVICE_ACCOUNT: '', FIRESTORE_EMULATOR_HOST: HOST, GEMINI_API_KEY: 'cle-test', AI_DAILY_LIMIT: '3' };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(email: string, opts: { secondFactor?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: email,
    exp: now + 3600,
    email,
    email_verified: true,
    firebase: opts.secondFactor === false ? {} : { sign_in_second_factor: 'totp' },
  })}.`;
}

function value(v: unknown): unknown {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { nullValue: null };
}
async function put(path: string, data: Record<string, unknown>) {
  await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)])) }),
  });
}

const realFetch = globalThis.fetch;
let geminiCalls = 0;

beforeAll(async () => {
  await realFetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await put('members/direction@test.cd', { email: 'direction@test.cd', role: 'admin', schoolId: 's1', active: true, classIds: [] });
  await put('members/prof@test.cd', { email: 'prof@test.cd', role: 'professeur', schoolId: 's1', active: true, classIds: ['c1'] });
  await put('members/autre@test.cd', { email: 'autre@test.cd', role: 'admin', schoolId: 's2', active: true, classIds: [] });
  await put('members/ancien@test.cd', { email: 'ancien@test.cd', role: 'admin', schoolId: 's1', active: false, classIds: [] });
  // Gemini simulé ; tout le reste (l'émulateur) passe par le vrai fetch.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('generativelanguage.googleapis.com')) {
      geminiCalls++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ students: [], remark: 'ok' }) }] } }] }), { status: 200 });
    }
    return realFetch(input, init);
  });
});

afterAll(() => vi.restoreAllMocks());

async function call(email: string, body: Record<string, unknown>, opts: { secondFactor?: boolean; env?: Record<string, string> } = {}) {
  const res = await handleImport(
    new Request('https://worker.test/ai/import', {
      method: 'POST',
      headers: { authorization: `Bearer ${token(email, opts)}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { ...env, ...opts.env } as never,
    {},
  );
  return { status: res.status, body: (await res.json()) as { result?: unknown; error?: string; used?: number } };
}

describe("route d'import avec Gemini", () => {
  it('la direction importe des élèves de son école', async () => {
    const r = await call('direction@test.cd', { schoolId: 's1', kind: 'students', text: 'BAHATI Amani, 6e B' });
    expect(r.status).toBe(200);
    expect(r.body.result).toEqual({ students: [], remark: 'ok' });
    expect(r.body.used).toBe(1);
  });

  it("refuse une autre école, un compte désactivé et une session sans second facteur", async () => {
    expect((await call('autre@test.cd', { schoolId: 's1', kind: 'students', text: 'x' })).status).toBe(403);
    expect((await call('ancien@test.cd', { schoolId: 's1', kind: 'students', text: 'x' })).status).toBe(403);
    expect((await call('direction@test.cd', { schoolId: 's1', kind: 'students', text: 'x' }, { secondFactor: false })).status).toBe(401);
    expect((await call('inconnu@test.cd', { schoolId: 's1', kind: 'quiz', text: 'x' })).status).toBe(403);
  });

  it("un professeur prépare une interrogation mais n'importe pas d'élèves", async () => {
    expect((await call('prof@test.cd', { schoolId: 's1', kind: 'students', text: 'x' })).status).toBe(403);
    expect((await call('prof@test.cd', { schoolId: 's1', kind: 'quiz', text: 'Le cycle de l’eau' })).status).toBe(200);
  });

  it('applique le plafond quotidien de l’école', async () => {
    const before = geminiCalls;
    const r = await call('direction@test.cd', { schoolId: 's1', kind: 'classes', text: 'programme' });
    expect(r.status).toBe(200);
    expect(r.body.used).toBe(3);
    const over = await call('direction@test.cd', { schoolId: 's1', kind: 'classes', text: 'programme' });
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/Limite de 3/);
    expect(geminiCalls).toBe(before + 1);
  });

  it('répond clairement sans clé API ou avec un document refusé', async () => {
    const noKey = await call('direction@test.cd', { schoolId: 's9', kind: 'students', text: 'x' }, { env: { GEMINI_API_KEY: '' } });
    expect(noKey.status).toBe(403); // s9 : pas son école, vérifié avant tout appel
    const r = await call('direction@test.cd', { schoolId: 's1', kind: 'students', file: { mimeType: 'application/zip', data: 'AA' } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Format/);
  });
});
