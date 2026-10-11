// Worker d'envoi des notifications, exécuté contre l'émulateur Firestore (mode émulateur :
// les messages sont notés au lieu de partir vers FCM). Lancé avec les tests de règles.
import { beforeAll, describe, expect, it } from 'vitest';
import { isQuietHour, processOutbox } from '../push/src/index';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'demo-push-test';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const env = { PROJECT_ID: PROJECT, PARENT_URL: 'https://parents.test', ALLOWED_ORIGINS: '', SERVICE_ACCOUNT: '', FIRESTORE_EMULATOR_HOST: HOST };

type Sent = { t: string; u: string; ti: string; b: string; k: string; s: string };
const sent = () => ((globalThis as { __peSent?: Sent[] }).__peSent ??= []);

function value(v: unknown): unknown {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, value(x)])) } };
}

async function put(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)])) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function get(path: string): Promise<Record<string, any>> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  const doc = (await res.json()) as { fields?: Record<string, any> };
  return doc.fields ?? {};
}

let n = 0;
/** Dépose une demande d'envoi, fait tourner le Worker et renvoie les messages partis. */
async function notify(kind: string, paths: string[], schoolId = 's1'): Promise<Sent[]> {
  const id = `n${++n}`;
  await put(`notifications/${id}`, { schoolId, kind, paths, status: 'pending', createdBy: 'direction@test.cd', createdAt: new Date().toISOString() });
  sent().length = 0;
  await processOutbox(env as never);
  const status = (await get(`notifications/${id}`)).status?.stringValue;
  expect(status).toBe('sent');
  return [...sent()];
}

const now = new Date();
// Décalage horaire qui place le parent u4 en pleine nuit (23 h chez lui).
let nightOffset = (23 * 60 - (now.getUTCHours() * 60 + now.getUTCMinutes()) + 1440) % 1440;
if (nightOffset > 840) nightOffset -= 1440;

beforeAll(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await put('schools/s1', { name: 'École test', currency: '$' });
  await put('students/st1', { schoolId: 's1', classId: 'c1', firstName: 'Esther', lastName: 'K' });
  await put('students/st2', { schoolId: 's1', classId: 'c2', firstName: 'Daniel', lastName: 'M' });
  await put('students/st9', { schoolId: 's2', classId: 'x', firstName: 'Autre', lastName: 'École' });
  const link = (st: string, uid: string) => put(`students/${st}/parents/${uid}`, { uid, studentId: st, schoolId: 's1' });
  await link('st1', 'u1');
  await link('st1', 'u3');
  await link('st2', 'u2');
  await link('st2', 'u4');
  await put('users/u1', { fcmTokens: ['tok-u1'] });
  await put('users/u2', { fcmTokens: ['tok-u2', 'perime-u2'] });
  await put('users/u3', { fcmTokens: ['tok-u3'], prefs: { notif: { notes: false } } });
  await put('users/u4', { fcmTokens: ['tok-u4'], prefs: { quiet: true, tzOffset: nightOffset } });

  await put('students/st1/grades/e1', { schoolId: 's1', studentId: 'st1', score: 16, max: 20, subjectName: 'Mathématiques', title: 'Interrogation n° 2' });
  await put('students/st1/bulletins/2026-2027_P1', { schoolId: 's1', studentName: 'Esther K', periodLabel: '1re période', percent: 81.5, rank: 2, classSize: 30 });
  await put('schools/s1/permissions/p1', { title: 'Sortie au lac Kivu', date: '2026-10-22', deadline: '2026-10-15', classIds: ['c1'] });
  await put('schools/s1/slots/sl1', { status: 'confirmed', bookedBy: 'u2', studentId: 'st2', teacherName: 'M. Kambale', date: '2026-10-14', start: '13:30', place: 'Salle 6B' });
  await put('students/st2/requests/r1', { schoolId: 's1', status: 'rejected', type: 'attestation', answer: 'Passez au secrétariat avec la fiche.', studentName: 'Daniel M' });
  await put('schools/s1/events/ev1', { title: 'Réunion des parents', date: '2026-10-17', time: '09:00', category: 'Réunion', place: 'Grande salle' });
  await put('schools/s1/announcements/a1', { title: 'Uniformes', content: 'Disponibles à la boutique.', category: 'Général', classIds: [] });
  await put('schools/s1/announcements/a2', { title: 'Fermeture', content: 'École fermée demain.', category: 'Urgent', classIds: [] });
  await put('students/st9/grades/e9', { schoolId: 's2', score: 10, max: 20, subjectName: 'Français', title: 'Dictée' });
});

const to = (list: Sent[]) => [...new Set(list.map((s) => s.u))].sort();

describe('Worker de notifications (émulateur)', () => {
  it('note : prénom de l’élève, branche, et respect de la catégorie coupée', async () => {
    const out = await notify('grade', ['students/st1/grades/e1']);
    expect(to(out)).toEqual(['u1']); // u3 a coupé « Notes et bulletins »
    expect(out[0].ti).toBe('Esther : 16/20 en Mathématiques');
    expect(out[0].k).toBe('grade');
  });

  it('bulletin publié', async () => {
    const out = await notify('bulletin', ['students/st1/bulletins/2026-2027_P1']);
    expect(to(out)).toEqual(['u1']);
    expect(out[0].ti).toBe('Bulletin de Esther : 1re période');
    expect(out[0].b).toBe('81,5 % · 2e place sur 30');
  });

  it('autorisation : seulement les parents de la classe visée', async () => {
    const out = await notify('permission', ['schools/s1/permissions/p1']);
    expect(to(out)).toEqual(['u1', 'u3']);
    expect(out[0].b).toContain('jeudi 22 octobre');
  });

  it('rendez-vous : seulement le parent qui l’a demandé, jeton périmé retiré', async () => {
    const out = await notify('appointment', ['schools/s1/slots/sl1']);
    expect(to(out)).toEqual(['u2']);
    expect(out[0].ti).toBe('Rendez-vous confirmé avec M. Kambale');
    const tokens = (await get('users/u2')).fcmTokens.arrayValue.values.map((v: { stringValue: string }) => v.stringValue);
    expect(tokens).toEqual(['tok-u2']);
  });

  it('demande refusée : réponse de l’école', async () => {
    const out = await notify('request', ['students/st2/requests/r1']);
    expect(to(out)).toEqual(['u2']); // u4 est en heures calmes
    expect(out[0].ti).toBe('Demande refusée : attestation de fréquentation');
  });

  it('agenda : toute l’école, sauf le parent en heures calmes', async () => {
    const out = await notify('event', ['schools/s1/events/ev1']);
    expect(to(out)).toEqual(['u1', 'u2', 'u3']);
    expect(out[0].b).toContain('samedi 17 octobre à 09:00');
  });

  it('un communiqué urgent passe même pendant les heures calmes', async () => {
    expect(to(await notify('announcement', ['schools/s1/announcements/a1']))).toEqual(['u1', 'u2', 'u3']);
    expect(to(await notify('announcement', ['schools/s1/announcements/a2']))).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it("ignore un document d'une autre école", async () => {
    expect(await notify('grade', ['students/st9/grades/e9'])).toEqual([]);
  });
});

describe('heures calmes', () => {
  it('de 21 h à 6 h à l’heure du parent', () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 11, h, m));
    expect(isQuietHour(120, at(18, 59))).toBe(false); // 20 h 59 à Goma
    expect(isQuietHour(120, at(19, 0))).toBe(true); // 21 h
    expect(isQuietHour(120, at(3, 59))).toBe(true); // 5 h 59
    expect(isQuietHour(120, at(4, 0))).toBe(false); // 6 h
    expect(isQuietHour(60, at(20, 30))).toBe(true); // Kinshasa, 21 h 30
  });
});
