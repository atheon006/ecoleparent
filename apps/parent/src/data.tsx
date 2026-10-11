import {
  computeStudentFinance,
  todayISO,
  type Acknowledgement,
  type Announcement,
  type AppointmentSlot,
  type Attendance,
  type Bulletin,
  type ClassRoom,
  type Conduct,
  type Evaluation,
  type FeeCategory,
  type Grade,
  type Homework,
  type HomeworkSeen,
  type ParentLink,
  type ParentRequest,
  type Payment,
  type PermissionAnswer,
  type PermissionSlip,
  type Rsvp,
  type RsvpAnswer,
  type School,
  type SchoolDocument,
  type SchoolEvent,
  type Student,
  type StudentFinance,
  type Timetable,
  type UserDevice,
  type UserPrefs,
} from '@pe/shared';
import { q, refs } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveDoc, useLiveMany, useLiveQuery } from '@pe/shared/hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Child {
  link: ParentLink;
  id: string;
  student: Student;
  school: School | null;
  classRoom: ClassRoom | null;
  currency: string;
  fees: FeeCategory[];
  payments: Payment[];
  attendance: Attendance[];
  conduct: Conduct[];
  homework: Homework[];
  seen: Set<string>;
  announcements: Announcement[];
  events: SchoolEvent[];
  finance: StudentFinance;
  /** Notes de l'élève (les plus récentes d'abord). */
  grades: Grade[];
  /** Bulletins publiés (les plus récents d'abord). */
  bulletins: Bulletin[];
  /** Évaluations de la classe : moyenne de la classe à chaque évaluation. */
  evaluations: Evaluation[];
  timetable: Timetable | null;
  /** Autorisations de sortie qui concernent la classe. */
  permissions: PermissionSlip[];
  permissionAnswers: Map<string, PermissionAnswer>;
  /** Créneaux de rendez-vous ouverts à la classe, ou réservés par ce parent. */
  slots: AppointmentSlot[];
  requests: ParentRequest[];
  documents: SchoolDocument[];
  /** Communiqués dont ce parent a confirmé la lecture. */
  acks: Set<string>;
  /** Réponses de ce parent aux réunions. */
  rsvps: Map<string, RsvpAnswer>;
}

export type FeedKind =
  | 'absence'
  | 'late'
  | 'payment'
  | 'conduct'
  | 'homework'
  | 'announcement'
  | 'grade'
  | 'bulletin'
  | 'permission'
  | 'appointment'
  | 'request';

export interface FeedItem {
  id: string;
  kind: FeedKind;
  at: string;
  childId: string | null;
  childName: string | null;
  title: string;
  body: string;
}

export interface UserDoc {
  prefs?: UserPrefs;
  devices?: Record<string, UserDevice>;
}

interface ParentData {
  loading: boolean;
  /** Une liaison vient d'être faite et attend la confirmation du serveur. */
  linking: boolean;
  /** Impossible de lire la liste des enfants (accès refusé, réseau). */
  error: Error | null;
  links: ParentLink[];
  children: Child[];
  active: Child | null;
  setActiveId: (id: string) => void;
  feed: FeedItem[];
  unread: number;
  /** Date de la dernière consultation des nouveautés. */
  seenAt: string;
  markFeedRead: () => void;
  /** Fiche du parent (préférences de notification, appareils). */
  userDoc: UserDoc | null;
}

const Ctx = createContext<ParentData | null>(null);

const ACTIVE_KEY = 'pe.activeChild';
const SEEN_KEY = 'pe.feedSeenAt';

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

export function ParentDataProvider({ children: content }: { children: ReactNode }) {
  const { db } = getFirebase();
  const { user } = useAuth();
  const uid = user!.uid;

  // Seulement les liaisons enregistrées par le serveur : avant, la fiche de l'élève est refusée
  // (les règles vérifient la liaison côté serveur) et l'enfant semblait ne pas être lié.
  const linksLive = useLiveQuery<ParentLink>(`links:${uid}`, () => q.myLinks(db, uid), { confirmedOnly: true });
  const links = useMemo(() => [...linksLive.data].sort((a, b) => a.linkedAt.localeCompare(b.linkedAt)), [linksLive.data]);
  const userDoc = useLiveDoc<UserDoc>(`user:${uid}`, () => refs.user(db, uid));

  // Un abonnement par enfant et par école.
  const schoolIds = [...new Set(links.map((l) => l.schoolId))];
  const perChild = useLiveMany<unknown>([
    ...links.flatMap((l) => [
      { key: `student:${l.studentId}`, make: () => refs.student(db, l.studentId) },
      { key: `pay:${l.studentId}`, make: () => q.childPayments(db, l.studentId) },
      { key: `att:${l.studentId}`, make: () => q.childAttendance(db, l.studentId) },
      { key: `cond:${l.studentId}`, make: () => q.childConduct(db, l.studentId) },
      { key: `seen:${l.studentId}`, make: () => q.childHomeworkSeen(db, l.studentId) },
    ]),
    ...schoolIds.flatMap((s) => [
      { key: `school:${s}`, make: () => refs.school(db, s) },
      { key: `fees:${s}`, make: () => q.fees(db, s) },
      { key: `ann:${s}`, make: () => q.announcements(db, s) },
      { key: `ev:${s}`, make: () => q.events(db, s) },
    ]),
  ]);
  const get = <T,>(key: string) => (perChild.data[key] ?? []) as T[];

  // Le reste (notes, horaire, autorisations…) : chargé après, sans retarder l'accueil.
  const extra = useLiveMany<unknown>([
    ...links.flatMap((l) => [
      { key: `grades:${l.studentId}`, make: () => q.childGrades(db, l.studentId) },
      { key: `bull:${l.studentId}`, make: () => q.childBulletins(db, l.studentId) },
      { key: `pans:${l.studentId}`, make: () => q.childPermissionAnswers(db, l.studentId) },
      { key: `req:${l.studentId}`, make: () => q.childRequests(db, l.studentId) },
    ]),
    ...schoolIds.flatMap((s) => [
      { key: `classes:${s}`, make: () => q.classes(db, s) },
      { key: `tt:${s}`, make: () => q.timetables(db, s) },
      { key: `perm:${s}`, make: () => q.permissions(db, s) },
      { key: `slots:${s}`, make: () => q.slots(db, s) },
      { key: `docs:${s}`, make: () => q.documents(db, s) },
    ]),
  ]);
  const getx = <T,>(key: string) => (extra.data[key] ?? []) as T[];

  // Devoirs et évaluations : un abonnement par classe (connue une fois l'élève chargé).
  const classKeys = [
    ...new Set(
      links
        .map((l) => get<Student>(`student:${l.studentId}`)[0])
        .filter(Boolean)
        .map((s) => `${s.schoolId}/${s.classId}`),
    ),
  ];
  const perClass = useLiveMany<unknown>(
    classKeys.flatMap((k) => {
      const [schoolId, classId] = k.split('/');
      return [
        { key: `hw:${k}`, make: () => q.classHomework(db, schoolId, classId) },
        { key: `evals:${k}`, make: () => q.classEvaluations(db, schoolId, classId) },
      ];
    }),
  );

  // Confirmations de lecture (communiqués importants) et réponses aux réunions de ce parent.
  const today = todayISO();
  const confirmations = useLiveMany<Acknowledgement | Rsvp>(
    schoolIds.flatMap((s) => [
      ...get<Announcement>(`ann:${s}`)
        .filter((a) => a.important)
        .map((a) => ({ key: `ack:${s}:${a.id}`, make: () => refs.ack(db, s, a.id, uid) })),
      ...get<SchoolEvent>(`ev:${s}`)
        .filter((e) => e.rsvp && (e.endDate || e.date) >= today)
        .map((e) => ({ key: `rsvp:${s}:${e.id}`, make: () => refs.rsvp(db, s, e.id, uid) })),
    ]),
  );

  const childList = useMemo<Child[]>(() => {
    const out: Child[] = [];
    for (const link of links) {
      const student = get<Student>(`student:${link.studentId}`)[0];
      if (!student) continue;
      const s = link.schoolId;
      const school = get<School>(`school:${s}`)[0] ?? null;
      const fees = get<FeeCategory>(`fees:${s}`);
      const payments = get<Payment>(`pay:${student.id}`);
      const forClass = (ids: string[] | undefined) => !ids?.length || ids.includes(student.classId);
      const classKey = `${student.schoolId}/${student.classId}`;
      const announcements = get<Announcement>(`ann:${s}`).filter((a) => forClass(a.classIds));
      const events = get<SchoolEvent>(`ev:${s}`).filter((e) => forClass(e.classIds));
      out.push({
        link,
        id: student.id,
        student,
        school,
        classRoom: getx<ClassRoom>(`classes:${s}`).find((c) => c.id === student.classId) ?? null,
        currency: school?.currency ?? '$',
        fees,
        payments,
        attendance: get<Attendance>(`att:${student.id}`),
        conduct: get<Conduct>(`cond:${student.id}`),
        homework: [...((perClass.data[`hw:${classKey}`] ?? []) as Homework[])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        seen: new Set(get<HomeworkSeen>(`seen:${student.id}`).map((x) => x.homeworkId)),
        announcements,
        events,
        finance: computeStudentFinance(student, fees, payments, today),
        grades: getx<Grade>(`grades:${student.id}`),
        bulletins: getx<Bulletin>(`bull:${student.id}`),
        evaluations: (perClass.data[`evals:${classKey}`] ?? []) as Evaluation[],
        timetable: getx<Timetable>(`tt:${s}`).find((t) => t.classId === student.classId) ?? null,
        permissions: getx<PermissionSlip>(`perm:${s}`).filter((p) => forClass(p.classIds)),
        permissionAnswers: new Map(getx<PermissionAnswer>(`pans:${student.id}`).map((a) => [a.permissionId, a])),
        slots: getx<AppointmentSlot>(`slots:${s}`).filter((x) => x.bookedBy === uid || (x.status === 'open' && forClass(x.classIds))),
        requests: getx<ParentRequest>(`req:${student.id}`),
        documents: getx<SchoolDocument>(`docs:${s}`),
        acks: new Set(announcements.filter((a) => (confirmations.data[`ack:${s}:${a.id}`] ?? []).length > 0).map((a) => a.id)),
        rsvps: new Map(
          events
            .map((e) => [e.id, ((confirmations.data[`rsvp:${s}:${e.id}`] ?? [])[0] as Rsvp | undefined)?.answer] as const)
            .filter((x): x is readonly [string, RsvpAnswer] => !!x[1]),
        ),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, perChild.data, extra.data, perClass.data, confirmations.data, today, uid]);

  const [activeId, setActiveIdState] = useState<string | null>(() => readLocal(ACTIVE_KEY));
  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    writeLocal(ACTIVE_KEY, id);
  }, []);
  const active = childList.find((c) => c.id === activeId) ?? childList[0] ?? null;

  // Fil des nouveautés (30 derniers jours), tous enfants confondus.
  const [seenAt, setSeenAt] = useState(() => readLocal(`${SEEN_KEY}:${uid}`) ?? '');
  const feed = useMemo(() => buildFeed(childList, uid), [childList, uid]);
  const unread = feed.filter((f) => f.at > seenAt).length;
  const markFeedRead = useCallback(() => {
    const now = new Date().toISOString();
    setSeenAt(now);
    writeLocal(`${SEEN_KEY}:${uid}`, now);
  }, [uid]);

  // Premier lancement : rien de « non lu » dans l'historique déjà présent.
  useEffect(() => {
    if (!seenAt && !linksLive.loading && !perChild.loading && childList.length) markFeedRead();
  }, [seenAt, linksLive.loading, perChild.loading, childList.length, markFeedRead]);

  const loading = linksLive.loading || (links.length > 0 && childList.length === 0 && perChild.loading);
  const linking = linksLive.pending > 0 && childList.length === 0;

  const value: ParentData = {
    loading,
    linking,
    error: linksLive.error,
    links,
    children: childList,
    active,
    setActiveId,
    feed,
    unread,
    seenAt,
    markFeedRead,
    userDoc: userDoc.data,
  };
  return <Ctx.Provider value={value}>{content}</Ctx.Provider>;
}

export function useParentData(): ParentData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useParentData doit être utilisé dans <ParentDataProvider>.');
  return ctx;
}

const fmtScore = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);

function buildFeed(children: Child[], uid: string): FeedItem[] {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const items: FeedItem[] = [];
  const once = new Set<string>();
  const push = (item: FeedItem) => {
    if (item.at < since || once.has(item.id)) return;
    once.add(item.id);
    items.push(item);
  };
  for (const c of children) {
    const name = c.student.firstName;
    const base = { childId: c.id, childName: name };
    for (const a of c.attendance) {
      if (a.status !== 'absent' && a.status !== 'late') continue;
      push({
        id: `att-${c.id}-${a.date}`,
        kind: a.status === 'absent' ? 'absence' : 'late',
        at: a.recordedAt,
        ...base,
        title: a.status === 'absent' ? `Absence de ${name}` : `Retard de ${name}`,
        body: a.reason || `Signalé par ${a.recordedByName}`,
      });
    }
    for (const p of c.payments) {
      push({ id: `pay-${p.id}`, kind: 'payment', at: p.createdAt, ...base, title: `Paiement reçu : ${p.amount} ${c.currency}`, body: `${p.feeName} · reçu ${p.reference}` });
    }
    for (const k of c.conduct) {
      push({ id: `cond-${k.id}`, kind: 'conduct', at: k.createdAt, ...base, title: `${k.type} · ${name}`, body: k.title });
    }
    for (const h of c.homework) {
      push({ id: `hw-${h.id}-${c.id}`, kind: 'homework', at: h.createdAt, ...base, title: `Nouveau devoir de ${h.subject}`, body: h.title });
    }
    for (const g of c.grades) {
      if (g.score === null) continue;
      push({ id: `grade-${c.id}-${g.id}`, kind: 'grade', at: g.updatedAt, ...base, title: `${g.subjectName} : ${fmtScore(g.score)}/${fmtScore(g.max)}`, body: `${g.title} · ${name}` });
    }
    for (const b of c.bulletins) {
      push({ id: `bull-${c.id}-${b.id}`, kind: 'bulletin', at: b.publishedAt, ...base, title: `Bulletin de ${name} : ${b.periodLabel}`, body: `${fmtScore(b.percent)} %${b.rank ? ` · ${b.rank === 1 ? '1re' : `${b.rank}e`} place sur ${b.classSize}` : ''}` });
    }
    for (const p of c.permissions) {
      if (c.permissionAnswers.has(p.id)) continue;
      push({ id: `perm-${p.id}-${c.id}`, kind: 'permission', at: p.createdAt, ...base, title: `Autorisation à signer : ${p.title}`, body: `Répondre avant le ${p.deadline.split('-').reverse().slice(0, 2).join('/')}` });
    }
    for (const s of c.slots) {
      if (s.bookedBy !== uid || (s.status !== 'confirmed' && s.status !== 'declined') || !s.bookedAt) continue;
      push({
        id: `slot-${s.id}-${s.status}`,
        kind: 'appointment',
        at: s.bookedAt,
        ...base,
        title: s.status === 'confirmed' ? `Rendez-vous confirmé avec ${s.teacherName}` : `Rendez-vous décliné par ${s.teacherName}`,
        body: `${s.date.split('-').reverse().slice(0, 2).join('/')} à ${s.start}`,
      });
    }
    for (const r of c.requests) {
      if (r.status === 'pending' || !r.handledAt) continue;
      push({ id: `req-${r.id}`, kind: 'request', at: r.handledAt, ...base, title: r.status === 'done' ? 'Votre demande a été traitée' : 'Votre demande a été refusée', body: r.answer || r.details });
    }
    for (const a of c.announcements) {
      push({ id: `ann-${a.id}`, kind: 'announcement', at: a.publishedAt, childId: null, childName: null, title: a.title, body: a.content });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
