// Module d'import avec Gemini : demande envoyée et lecture de la réponse (appel simulé).
import { describe, expect, it } from 'vitest';
import { ImportError, callGemini, checkInput } from '../push/src/ai';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const reply = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });

describe('import avec Gemini', () => {
  it('refuse sans clé API', async () => {
    await expect(callGemini({}, { kind: 'students', text: 'x' })).rejects.toMatchObject({ status: 503 });
  });

  it('vérifie le type et la taille du document', () => {
    expect(() => checkInput({ kind: 'students' })).toThrow(ImportError);
    expect(() => checkInput({ kind: 'students', file: { mimeType: 'application/zip', data: 'AA' } })).toThrow(/Format/);
    expect(() => checkInput({ kind: 'nope' as never, text: 'x' })).toThrow(/inconnu/);
    expect(() => checkInput({ kind: 'timetable', file: { mimeType: 'image/jpeg', data: 'AA' } })).not.toThrow();
  });

  it('envoie le PDF, le schéma JSON et la clé, puis lit la réponse', async () => {
    const students = [{ lastName: 'KABIBI', firstName: 'Mwamba Esther', gender: 'F', birthDate: '2015-03-12', className: '6e B', parentName: 'Furaha', parentPhone: '0970000000', uncertain: [] }];
    const { fetcher, calls } = fakeFetch(200, reply({ students, remark: '' }));
    const out = await callGemini({ GEMINI_API_KEY: 'cle-test' }, { kind: 'students', file: { mimeType: 'application/pdf', data: 'JVBERi0=' }, hints: { classes: ['6e Primaire B'] } }, fetcher);
    expect(out).toEqual({ students, remark: '' });
    expect(calls[0].url).toContain('models/gemini-flash-latest:generateContent');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('cle-test');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.generationConfig.responseSchema.properties.students.type).toBe('ARRAY');
    expect(sent.contents[0].parts[1].inline_data.mime_type).toBe('application/pdf');
    expect(sent.contents[0].parts[0].text).toContain('6e Primaire B');
    expect(sent.contents[0].parts[0].text).toContain('Ne devine jamais le sexe');
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
  });

  it('renvoie la demande sans réglage de réflexion si le modèle le refuse', async () => {
    const bodies: { generationConfig: Record<string, unknown> }[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (bodies.length === 1) return new Response(JSON.stringify({ error: { message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } }), { status: 400 });
      return new Response(JSON.stringify(reply({ title: 'T', questions: [] })), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'quiz', text: 'cours' }, fetcher, [])).resolves.toEqual({ title: 'T', questions: [] });
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined();
  });

  it('utilise le modèle choisi et le texte des fichiers Word ou Excel', async () => {
    const { fetcher, calls } = fakeFetch(200, reply({ title: 'Interro', questions: [] }));
    await callGemini({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash' }, { kind: 'quiz', text: 'Le cycle de l’eau…', hints: { count: 5, subject: 'Sciences' } }, fetcher);
    expect(calls[0].url).toContain('models/gemini-2.5-flash:generateContent');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.contents[0].parts[0].text).toContain('5 questions');
    expect(sent.contents[0].parts[1].text).toContain('cycle de l’eau');
  });

  it('traduit les erreurs de Gemini en messages clairs', async () => {
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fakeFetch(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).fetcher, [])).rejects.toMatchObject({ status: 429 });
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fakeFetch(400, { error: { message: 'API key not valid' } }).fetcher, [])).rejects.toThrow(/clé API/);
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{oups' }] }, finishReason: 'MAX_TOKENS' }] }).fetcher, [])).rejects.toThrow(/découpez/);
  });

  it('réessaie quand Gemini est saturé, puis passe au modèle léger', async () => {
    const urls: string[] = [];
    let n = 0;
    const fetcher = (async (url: string) => {
      urls.push(url);
      n++;
      if (n < 3) return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 });
      return new Response(JSON.stringify(reply({ title: 'T', questions: [] })), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'quiz', text: 'cours' }, fetcher, [0])).resolves.toEqual({ title: 'T', questions: [] });
    expect(urls.slice(0, 2).every((u) => u.includes('gemini-flash-latest'))).toBe(true);
    expect(urls[2]).toContain('gemini-flash-lite-latest');
  });

  it('passe directement au modèle léger si Gemini met trop de temps', async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      if (urls.length === 1) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return new Response(JSON.stringify(reply({ title: 'T', questions: [] })), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'quiz', text: 'cours' }, fetcher, [0])).resolves.toEqual({ title: 'T', questions: [] });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('gemini-flash-lite-latest');
  });

  it("n'envoie que M ou F : le sexe inconnu (X) devient vide", async () => {
    const students = [{ lastName: 'A', firstName: 'B', gender: 'X', birthDate: '', className: '', parentName: '', parentPhone: '', uncertain: ['gender'] }];
    const { fetcher, calls } = fakeFetch(200, reply({ students, remark: '' }));
    const out = (await callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fetcher, [])) as { students: { gender: string }[] };
    expect(out.students[0].gender).toBe('');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.generationConfig.responseSchema.properties.students.items.properties.gender.enum).toEqual(['M', 'F', 'X']);
  });
});
