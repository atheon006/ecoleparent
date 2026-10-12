import { limit, orderBy, query, where, type Firestore } from 'firebase/firestore';
import { refs } from './refs';

// Requêtes de lecture. Les requêtes « groupe de collections » (toute l'école)
// ont besoin des index déclarés dans firestore.indexes.json.

export const q = {
  schools: (db: Firestore) => query(refs.schools(db)),
  members: (db: Firestore, schoolId: string) => query(refs.members(db), where('schoolId', '==', schoolId)),
  classes: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'classes')),
  fees: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'fees')),
  announcements: (db: Firestore, schoolId: string) =>
    query(refs.schoolSub(db, schoolId, 'announcements'), orderBy('publishedAt', 'desc'), limit(100)),
  events: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'events'), orderBy('date')),
  homework: (db: Firestore, schoolId: string) =>
    query(refs.schoolSub(db, schoolId, 'homework'), orderBy('dueDate', 'desc'), limit(300)),
  classHomework: (db: Firestore, schoolId: string, classId: string) =>
    query(refs.schoolSub(db, schoolId, 'homework'), where('classId', '==', classId)),

  students: (db: Firestore, schoolId: string) => query(refs.students(db), where('schoolId', '==', schoolId)),
  classStudents: (db: Firestore, schoolId: string, classId: string) =>
    query(refs.students(db), where('schoolId', '==', schoolId), where('classId', '==', classId)),

  // Toute l'école (groupe de collections)
  schoolPayments: (db: Firestore, schoolId: string, max = 500) =>
    query(refs.group(db, 'payments'), where('schoolId', '==', schoolId), orderBy('date', 'desc'), limit(max)),
  schoolAttendanceOn: (db: Firestore, schoolId: string, date: string) =>
    query(refs.group(db, 'attendance'), where('schoolId', '==', schoolId), where('date', '==', date)),
  /** Absences de l'école depuis une date (graphique du tableau de bord). */
  schoolAbsencesSince: (db: Firestore, schoolId: string, from: string) =>
    query(refs.group(db, 'attendance'), where('schoolId', '==', schoolId), where('status', '==', 'absent'), where('date', '>=', from)),
  pendingJustifications: (db: Firestore, schoolId: string) =>
    query(refs.group(db, 'attendance'), where('schoolId', '==', schoolId), where('justificationStatus', '==', 'pending')),
  schoolConduct: (db: Firestore, schoolId: string, max = 200) =>
    query(refs.group(db, 'conduct'), where('schoolId', '==', schoolId), orderBy('date', 'desc'), limit(max)),
  classHomeworkSeen: (db: Firestore, schoolId: string, classId: string) =>
    query(refs.group(db, 'homeworkSeen'), where('schoolId', '==', schoolId), where('classId', '==', classId)),

  // Un élève
  childAttendance: (db: Firestore, studentId: string) =>
    query(refs.studentSub(db, studentId, 'attendance'), orderBy('date', 'desc'), limit(400)),
  childPayments: (db: Firestore, studentId: string) =>
    query(refs.studentSub(db, studentId, 'payments'), orderBy('date', 'desc')),
  childConduct: (db: Firestore, studentId: string) =>
    query(refs.studentSub(db, studentId, 'conduct'), orderBy('date', 'desc')),
  childHomeworkSeen: (db: Firestore, studentId: string) => query(refs.studentSub(db, studentId, 'homeworkSeen')),

  // Parent : ses enfants liés
  myLinks: (db: Firestore, uid: string) => query(refs.group(db, 'parents'), where('uid', '==', uid)),

  // Notes et bulletins
  classEvaluations: (db: Firestore, schoolId: string, classId: string) =>
    query(refs.schoolSub(db, schoolId, 'evaluations'), where('classId', '==', classId), orderBy('date', 'desc')),
  evaluationGrades: (db: Firestore, schoolId: string, evaluationId: string) =>
    query(refs.group(db, 'grades'), where('schoolId', '==', schoolId), where('evaluationId', '==', evaluationId)),
  classGradesOfYear: (db: Firestore, schoolId: string, classId: string, year: string) =>
    query(refs.group(db, 'grades'), where('schoolId', '==', schoolId), where('classId', '==', classId), where('year', '==', year)),
  classBulletinsOfYear: (db: Firestore, schoolId: string, classId: string, year: string) =>
    query(refs.group(db, 'bulletins'), where('schoolId', '==', schoolId), where('classId', '==', classId), where('year', '==', year)),
  childGrades: (db: Firestore, studentId: string) => query(refs.studentSub(db, studentId, 'grades'), orderBy('date', 'desc')),
  childBulletins: (db: Firestore, studentId: string) => query(refs.studentSub(db, studentId, 'bulletins'), orderBy('publishedAt', 'desc')),

  // Horaire, autorisations, rendez-vous, documents
  timetables: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'timetables')),
  permissions: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'permissions'), orderBy('date', 'desc'), limit(100)),
  permissionAnswers: (db: Firestore, schoolId: string, permissionId: string) =>
    query(refs.group(db, 'permissionAnswers'), where('schoolId', '==', schoolId), where('permissionId', '==', permissionId)),
  childPermissionAnswers: (db: Firestore, studentId: string) => query(refs.studentSub(db, studentId, 'permissionAnswers')),
  slots: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'slots'), orderBy('date'), limit(400)),
  documents: (db: Firestore, schoolId: string) => query(refs.schoolSub(db, schoolId, 'documents')),

  // Demandes des parents
  pendingRequests: (db: Firestore, schoolId: string) =>
    query(refs.group(db, 'requests'), where('schoolId', '==', schoolId), where('status', '==', 'pending')),
  schoolRequests: (db: Firestore, schoolId: string, max = 200) =>
    query(refs.group(db, 'requests'), where('schoolId', '==', schoolId), orderBy('createdAt', 'desc'), limit(max)),
  childRequests: (db: Firestore, studentId: string) => query(refs.studentSub(db, studentId, 'requests'), orderBy('createdAt', 'desc')),

  // Confirmations de lecture et réponses aux réunions
  announcementAcks: (db: Firestore, schoolId: string, announcementId: string) => query(refs.acks(db, schoolId, announcementId)),
  eventRsvps: (db: Firestore, schoolId: string, eventId: string) => query(refs.rsvps(db, schoolId, eventId)),
  myAcks: (db: Firestore, uid: string) => query(refs.groupOf(db, 'acks'), where('uid', '==', uid)),
  myRsvps: (db: Firestore, uid: string) => query(refs.groupOf(db, 'rsvps'), where('uid', '==', uid)),
};
