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
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fakeFetch(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).fetcher)).rejects.toMatchObject({ status: 429 });
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fakeFetch(400, { error: { message: 'API key not valid' } }).fetcher)).rejects.toThrow(/clé API/);
    await expect(callGemini({ GEMINI_API_KEY: 'k' }, { kind: 'students', text: 'x' }, fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{oups' }] }, finishReason: 'MAX_TOKENS' }] }).fetcher)).rejects.toThrow(/découpez/);
  });
});
