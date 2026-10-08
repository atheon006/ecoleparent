// Tests des règles Firestore contre l'émulateur : `npm run test:rules` (Java requis).
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as api from '../packages/shared/src/api';
import type { Member, Student } from '../packages/shared/src/types';

let env: RulesTestEnvironment;

const SCHOOL = 'horizon';
const OTHER = 'saint-joseph';

// Personnel connecté avec le code de son application d'authentification.
const staff = (email: string) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com', sign_in_second_factor: 'totp' } });

function db(uid: string | null, token?: Record<string, unknown>): Firestore {
  const ctx = uid ? env.authenticatedContext(uid, token) : env.unauthenticatedContext();
  return ctx.firestore() as unknown as Firestore;
}

const superDb = () => db('super', staff('super@parentecole.cd'));
const adminDb = () => db('dir', staff('dir@horizon.cd'));
const otherAdminDb = () => db('dir2', staff('dir@stjoseph.cd'));
const caisseDb = () => db('caisse', staff('caisse@horizon.cd'));
const survDb = () => db('surv', staff('surv@horizon.cd'));
const profDb = () => db('prof', staff('prof@horizon.cd'));
const parentDb = () => db('parent-uid', { email: 'marie@gmail.com', email_verified: false });
const strangerDb = () => db('stranger-uid', { email: 'x@gmail.com', email_verified: true });

const member = (email: string, schoolId: string, role: Member['role'], classIds: string[] = []): Member => ({
  email,
  schoolId,
  role,
  name: email.split('@')[0],
  classIds,
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
});

const baseStudent = {
  classId: 'c-3sci',
  className: '3e Scientifique A',
  firstName: 'David',
  lastName: 'Kasereka',
  gender: 'M' as const,
  parentName: 'Marie Kavira',
  parentPhone: '+243 812 345 678',
  hasTransport: true,
  hasCantine: false,
  customFeeIds: [],
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-parentecole',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(d, 'superadmins/super@parentecole.cd'), {});
    await setDoc(doc(d, `schools/${SCHOOL}`), { name: 'Complexe Scolaire Horizon', codePrefix: 'CSH', currency: '$', active: true });
    await setDoc(doc(d, `schools/${OTHER}`), { name: 'Lycée Saint-Joseph', codePrefix: 'LSJ', currency: '$', active: true });
    await setDoc(doc(d, 'members/dir@horizon.cd'), member('dir@horizon.cd', SCHOOL, 'admin'));
    await setDoc(doc(d, 'members/dir@stjoseph.cd'), member('dir@stjoseph.cd', OTHER, 'admin'));
    await setDoc(doc(d, 'members/caisse@horizon.cd'), member('caisse@horizon.cd', SCHOOL, 'caissier'));
    await setDoc(doc(d, 'members/surv@horizon.cd'), member('surv@horizon.cd', SCHOOL, 'surveillant'));
    await setDoc(doc(d, 'members/prof@horizon.cd'), member('prof@horizon.cd', SCHOOL, 'professeur', ['c-3sci']));
    await setDoc(doc(d, `schools/${SCHOOL}/classes/c-3sci`), { schoolId: SCHOOL, name: '3e Scientifique A', level: 'Secondaire' });
    await setDoc(doc(d, `schools/${SCHOOL}/announcements/a1`), { schoolId: SCHOOL, title: 'AG', content: '...', category: 'Général', classIds: [], publishedAt: '2026-09-20T00:00:00Z', author: 'Direction' });
  });
});

async function createDavid(): Promise<Student> {
  return api.createStudent(adminDb(), { id: SCHOOL, codePrefix: 'CSH' }, { ...baseStudent, schoolId: SCHOOL });
}

describe('écoles et personnel', () => {
  it('seul un super-administrateur crée une école (et son directeur)', async () => {
    const input = { name: 'École Test', address: 'Goma', phone: '0990000000', currency: 'FC', adminEmail: 'Dir@Test.cd', adminName: 'Directeur' };
    await assertFails(api.createSchool(adminDb(), input));
    const id = await assertSucceeds(api.createSchool(superDb(), input));
    const m = await getDoc(doc(superDb(), 'members/dir@test.cd'));
    expect(m.data()?.schoolId).toBe(id);
  });

  it('un directeur gère le personnel de son école, pas celui d’une autre', async () => {
    await assertSucceeds(api.saveMember(adminDb(), { email: 'Nouveau@horizon.cd', schoolId: SCHOOL, role: 'professeur', name: 'Prof', classIds: [] }));
    // saveMember traduit le refus en message lisible.
    await expect(api.saveMember(adminDb(), { email: 'x@stjoseph.cd', schoolId: OTHER, role: 'professeur', name: 'X' })).rejects.toThrow(/autre école/);
    // Reprendre le directeur d'une autre école : refusé.
    await expect(api.saveMember(adminDb(), { email: 'dir@stjoseph.cd', schoolId: SCHOOL, role: 'caissier', name: 'X' })).rejects.toThrow();
    await assertSucceeds(getDocs(api.q.members(adminDb(), SCHOOL)));
    await assertFails(getDocs(api.q.members(adminDb(), OTHER)));
  });

  it('sans code d’authentification, le personnel et le super-administrateur n’ont aucun droit', async () => {
    const noMfa = (email: string) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    await assertFails(getDocs(api.q.students(db('dir', noMfa('dir@horizon.cd')), SCHOOL)));
    await assertFails(getDocs(api.q.schoolPayments(db('caisse', noMfa('caisse@horizon.cd')), SCHOOL)));
    await assertFails(api.createSchool(db('super', noMfa('super@parentecole.cd')), { name: 'X', address: '', phone: '', currency: '$', adminEmail: 'x@x.cd', adminName: 'X' }));
    // Il peut quand même lire sa propre fiche (pour que le site sache quel écran afficher).
    await assertSucceeds(getDoc(doc(db('dir', noMfa('dir@horizon.cd')), 'members/dir@horizon.cd')));
  });

  it('un compte à e-mail non vérifié n’a aucun droit de personnel', async () => {
    const unverified = db('dir', { email: 'dir@horizon.cd', email_verified: false, firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } });
    await assertFails(getDocs(api.q.students(unverified, SCHOOL)));
  });

  it('un caissier ne peut pas modifier les frais ni inscrire un élève', async () => {
    await assertFails(api.saveFee(caisseDb(), { schoolId: SCHOOL, name: 'X', type: 'tuition', totalAmount: 10, classIds: [], installments: [] }));
    await assertFails(api.createStudent(caisseDb(), { id: SCHOOL, codePrefix: 'CSH' }, { ...baseStudent, schoolId: SCHOOL }));
  });
});

describe('élèves et liaison parent', () => {
  it('le directeur inscrit un élève ; le matricule est réservé', async () => {
    const s = await createDavid();
    expect(s.matricule).toMatch(/^PE-CSH-\d{4}-/);
    expect(s.parentPhoneKeys).toEqual(['812345678']);
    const code = await api.lookupCode(parentDb(), s.matricule.toLowerCase());
    expect(code?.studentId).toBe(s.id);
  });

  it('le personnel d’une autre école ne voit pas les élèves', async () => {
    await createDavid();
    await assertSucceeds(getDocs(api.q.students(caisseDb(), SCHOOL)));
    await assertFails(getDocs(api.q.students(otherAdminDb(), SCHOOL)));
  });

  it('personne ne peut lister les matricules', async () => {
    await createDavid();
    const { collection } = await import('firebase/firestore');
    await assertFails(getDocs(collection(strangerDb(), 'codes')));
  });

  it('un parent avec le bon code mais un autre numéro est refusé', async () => {
    const s = await createDavid();
    await expect(
      api.linkChild(parentDb(), { uid: 'parent-uid', email: 'marie@gmail.com', name: 'Marie', code: s.matricule, phone: '0999999999' }),
    ).rejects.toThrow(/ne correspond pas/);
    await assertFails(getDoc(doc(parentDb(), `students/${s.id}`)));
  });

  it('un parent lié voit son enfant, ses présences, paiements et l’école ; pas les autres', async () => {
    const s = await createDavid();
    const other = await api.createStudent(adminDb(), { id: SCHOOL, codePrefix: 'CSH' }, { ...baseStudent, schoolId: SCHOOL, firstName: 'Grace', parentPhone: '0811111111' });
    await assertSucceeds(api.linkChild(parentDb(), { uid: 'parent-uid', email: 'marie@gmail.com', name: 'Marie', code: s.matricule, phone: '0812345678' }));

    await assertSucceeds(getDoc(doc(parentDb(), `students/${s.id}`)));
    await assertSucceeds(getDocs(api.q.childAttendance(parentDb(), s.id)));
    await assertSucceeds(getDocs(api.q.childPayments(parentDb(), s.id)));
    await assertSucceeds(getDocs(api.q.announcements(parentDb(), SCHOOL)));
    await assertSucceeds(getDoc(doc(parentDb(), `schools/${SCHOOL}`)));
    const links = await assertSucceeds(getDocs(api.q.myLinks(parentDb(), 'parent-uid')));
    expect(links.size).toBe(1);

    await assertFails(getDoc(doc(parentDb(), `students/${other.id}`)));
    await assertFails(getDocs(api.q.childPayments(parentDb(), other.id)));
    await assertFails(getDocs(api.q.announcements(strangerDb(), SCHOOL)));
    await assertFails(getDocs(api.q.students(parentDb(), SCHOOL)));
  });

  it('un parent ne peut pas se lier au nom de quelqu’un d’autre', async () => {
    const s = await createDavid();
    await assertFails(
      setDoc(doc(strangerDb(), `students/${s.id}/parents/parent-uid`), { uid: 'parent-uid', studentId: s.id, schoolId: SCHOOL, phone: '812345678' }),
    );
  });
});

describe('présences', () => {
  it('le surveillant fait l’appel d’une classe de 30 élèves', async () => {
    const students = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        api.createStudent(adminDb(), { id: SCHOOL, codePrefix: 'CSH' }, { ...baseStudent, schoolId: SCHOOL, firstName: `Élève ${i}` }),
      ),
    );
    await assertSucceeds(
      api.saveClassAttendance(survDb(), {
        schoolId: SCHOOL,
        classId: 'c-3sci',
        date: '2026-10-07',
        students,
        marks: { [students[3].id]: { status: 'absent' }, [students[7].id]: { status: 'late', reason: 'Bus' } },
        recordedBy: 'surv@horizon.cd',
        recordedByName: 'Surveillant',
      }),
    );
    const day = await getDocs(api.q.schoolAttendanceOn(adminDb(), SCHOOL, '2026-10-07'));
    expect(day.size).toBe(30);
    expect(day.docs.filter((d) => d.data().status === 'absent')).toHaveLength(1);
  });

  it('un professeur fait l’appel de ses classes seulement ; un caissier jamais', async () => {
    const s = await createDavid();
    const input = { schoolId: SCHOOL, date: '2026-10-07', students: [s], marks: {}, recordedBy: 'x', recordedByName: 'x' };
    await assertSucceeds(api.saveClassAttendance(profDb(), { ...input, classId: 'c-3sci' }));
    await assertFails(api.saveClassAttendance(profDb(), { ...input, classId: 'c-autre' }));
    await assertFails(api.saveClassAttendance(caisseDb(), { ...input, classId: 'c-3sci' }));
  });

  it('le parent justifie une absence mais ne peut pas changer le statut', async () => {
    const s = await createDavid();
    await api.saveClassAttendance(survDb(), {
      schoolId: SCHOOL, classId: 'c-3sci', date: '2026-10-07', students: [s],
      marks: { [s.id]: { status: 'absent' } }, recordedBy: 'surv@horizon.cd', recordedByName: 'S',
    });
    await api.linkChild(parentDb(), { uid: 'parent-uid', email: 'marie@gmail.com', name: 'Marie', code: s.matricule, phone: '812345678' });
    await assertSucceeds(api.justifyAbsence(parentDb(), s.id, '2026-10-07', 'Malade, certificat médical demain.'));
    await assertFails(updateDoc(doc(parentDb(), `students/${s.id}/attendance/2026-10-07`), { status: 'present' }));
    const pending = await getDocs(api.q.pendingJustifications(survDb(), SCHOOL));
    expect(pending.size).toBe(1);
    await assertSucceeds(api.reviewJustification(survDb(), { studentId: s.id, date: '2026-10-07', status: 'absent' }, true));
    const after = await getDoc(doc(parentDb(), `students/${s.id}/attendance/2026-10-07`));
    expect(after.data()?.status).toBe('excused');
  });
});

describe('paiements, conduite, devoirs', () => {
  it('le caissier encaisse ; le surveillant non ; le parent voit le reçu', async () => {
    const s = await createDavid();
    const payment = { student: s, feeId: 'minerval', feeName: 'Minerval', amount: 150, method: 'Espèces' as const, date: '2026-10-07' };
    await assertSucceeds(api.recordPayment(caisseDb(), { ...payment, recordedBy: 'caisse@horizon.cd', recordedByName: 'Caisse' }));
    await assertFails(api.recordPayment(survDb(), { ...payment, recordedBy: 'surv@horizon.cd', recordedByName: 'S' }));
    await assertFails(api.recordPayment(caisseDb(), { ...payment, recordedBy: 'quelquun@autre.cd', recordedByName: 'X' }));
    await assertSucceeds(getDocs(api.q.schoolPayments(caisseDb(), SCHOOL)));
    await assertFails(getDocs(api.q.schoolPayments(profDb(), SCHOOL)));
    await api.linkChild(parentDb(), { uid: 'parent-uid', email: 'marie@gmail.com', name: 'Marie', code: s.matricule, phone: '812345678' });
    const mine = await getDocs(api.q.childPayments(parentDb(), s.id));
    expect(mine.size).toBe(1);
  });

  it('conduite et devoirs vus', async () => {
    const s = await createDavid();
    await assertSucceeds(
      api.addConduct(profDb(), {
        studentId: s.id, schoolId: SCHOOL, classId: s.classId, studentName: 'David Kasereka', type: 'Félicitation',
        severity: 'positive', title: 'Bravo', comment: '', date: '2026-10-07', author: 'Prof', createdBy: 'prof@horizon.cd',
      }),
    );
    await assertSucceeds(
      api.addHomework(profDb(), {
        schoolId: SCHOOL, classId: 'c-3sci', className: '3e Sci A', subject: 'Maths', title: 'Ex. 12', description: '',
        dueDate: '2026-10-08', teacherName: 'Prof', createdBy: 'prof@horizon.cd',
      }),
    );
    await assertFails(
      api.addHomework(profDb(), {
        schoolId: SCHOOL, classId: 'c-autre', className: 'Autre', subject: 'Maths', title: 'Ex', description: '',
        dueDate: '2026-10-08', teacherName: 'Prof', createdBy: 'prof@horizon.cd',
      }),
    );
    await api.linkChild(parentDb(), { uid: 'parent-uid', email: 'marie@gmail.com', name: 'Marie', code: s.matricule, phone: '812345678' });
    await assertSucceeds(getDocs(api.q.classHomework(parentDb(), SCHOOL, 'c-3sci')));
    await assertSucceeds(api.markHomeworkSeen(parentDb(), { homeworkId: 'hw1', studentId: s.id, schoolId: SCHOOL, classId: 'c-3sci', uid: 'parent-uid' }));
    const seen = await getDocs(api.q.classHomeworkSeen(profDb(), SCHOOL, 'c-3sci'));
    expect(seen.size).toBe(1);
    await assertSucceeds(getDocs(api.q.childConduct(parentDb(), s.id)));
  });
});

describe('notifications push', () => {
  const request = (schoolId: string, createdBy: string) => ({
    schoolId,
    kind: 'attendance',
    paths: ['students/s1/attendance/2026-10-08'],
    status: 'pending',
    createdBy,
    createdAt: '2026-10-08T07:50:00Z',
  });

  it('le personnel dépose une demande pour son école, à son nom seulement', async () => {
    await assertSucceeds(setDoc(doc(survDb(), 'notifications/n1'), request(SCHOOL, 'surv@horizon.cd')));
    await assertFails(setDoc(doc(survDb(), 'notifications/n2'), request(OTHER, 'surv@horizon.cd')));
    await assertFails(setDoc(doc(survDb(), 'notifications/n3'), request(SCHOOL, 'dir@horizon.cd')));
    await assertFails(setDoc(doc(survDb(), 'notifications/n4'), { ...request(SCHOOL, 'surv@horizon.cd'), status: 'sent' }));
    await assertFails(setDoc(doc(survDb(), 'notifications/n5'), { ...request(SCHOOL, 'surv@horizon.cd'), title: 'Texte libre' }));
  });

  it('ni un parent ni un inconnu ne déposent de demande ; personne ne les lit', async () => {
    await assertFails(setDoc(doc(parentDb(), 'notifications/n1'), request(SCHOOL, 'marie@gmail.com')));
    await assertFails(setDoc(doc(strangerDb(), 'notifications/n1'), request(SCHOOL, 'x@gmail.com')));
    await assertSucceeds(setDoc(doc(adminDb(), 'notifications/n9'), request(SCHOOL, 'dir@horizon.cd')));
    await assertFails(getDoc(doc(adminDb(), 'notifications/n9')));
    await assertFails(getDoc(doc(superDb(), 'notifications/n9')));
  });
});
