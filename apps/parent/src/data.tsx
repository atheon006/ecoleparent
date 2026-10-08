import {
  computeStudentFinance,
  todayISO,
  type Announcement,
  type Attendance,
  type Conduct,
  type FeeCategory,
  type Homework,
  type HomeworkSeen,
  type ParentLink,
  type Payment,
  type School,
  type SchoolEvent,
  type Student,
  type StudentFinance,
} from '@pe/shared';
import { q, refs } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveMany, useLiveQuery } from '@pe/shared/hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Child {
  link: ParentLink;
  id: string;
  student: Student;
  school: School | null;
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
}

export type FeedKind = 'absence' | 'late' | 'payment' | 'conduct' | 'homework' | 'announcement';

export interface FeedItem {
  id: string;
  kind: FeedKind;
  at: string;
  childId: string | null;
  childName: string | null;
  title: string;
  body: string;
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

  // Devoirs : un abonnement par classe (connue une fois l'élève chargé).
  const classKeys = [
    ...new Set(
      links
        .map((l) => get<Student>(`student:${l.studentId}`)[0])
        .filter(Boolean)
        .map((s) => `${s.schoolId}/${s.classId}`),
    ),
  ];
  const hw = useLiveMany<Homework>(
    classKeys.map((k) => {
      const [schoolId, classId] = k.split('/');
      return { key: `hw:${k}`, make: () => q.classHomework(db, schoolId, classId) };
    }),
  );

  const today = todayISO();
  const childList = useMemo<Child[]>(() => {
    const out: Child[] = [];
    for (const link of links) {
      const student = get<Student>(`student:${link.studentId}`)[0];
      if (!student) continue;
      const school = get<School>(`school:${link.schoolId}`)[0] ?? null;
      const fees = get<FeeCategory>(`fees:${link.schoolId}`);
      const payments = get<Payment>(`pay:${student.id}`);
      const forClass = (ids: string[] | undefined) => !ids?.length || ids.includes(student.classId);
      out.push({
        link,
        id: student.id,
        student,
        school,
        currency: school?.currency ?? '$',
        fees,
        payments,
        attendance: get<Attendance>(`att:${student.id}`),
        conduct: get<Conduct>(`cond:${student.id}`),
        homework: [...(hw.data[`hw:${student.schoolId}/${student.classId}`] ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        seen: new Set(get<HomeworkSeen>(`seen:${student.id}`).map((s) => s.homeworkId)),
        announcements: get<Announcement>(`ann:${link.schoolId}`).filter((a) => forClass(a.classIds)),
        events: get<SchoolEvent>(`ev:${link.schoolId}`),
        finance: computeStudentFinance(student, fees, payments, today),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, perChild.data, hw.data, today]);

  const [activeId, setActiveIdState] = useState<string | null>(() => readLocal(ACTIVE_KEY));
  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    writeLocal(ACTIVE_KEY, id);
  }, []);
  const active = childList.find((c) => c.id === activeId) ?? childList[0] ?? null;

  // Fil des nouveautés (30 derniers jours), tous enfants confondus.
  const [seenAt, setSeenAt] = useState(() => readLocal(`${SEEN_KEY}:${uid}`) ?? '');
  const feed = useMemo(() => buildFeed(childList), [childList]);
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

  const value: ParentData = { loading, linking, error: linksLive.error, links, children: childList, active, setActiveId, feed, unread, seenAt, markFeedRead };
  return <Ctx.Provider value={value}>{content}</Ctx.Provider>;
}

export function useParentData(): ParentData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useParentData doit être utilisé dans <ParentDataProvider>.');
  return ctx;
}

function buildFeed(children: Child[]): FeedItem[] {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const items: FeedItem[] = [];
  const announced = new Set<string>();
  for (const c of children) {
    const name = c.student.firstName;
    for (const a of c.attendance) {
      if (a.recordedAt < since || (a.status !== 'absent' && a.status !== 'late')) continue;
      items.push({
        id: `att-${c.id}-${a.date}`,
        kind: a.status === 'absent' ? 'absence' : 'late',
        at: a.recordedAt,
        childId: c.id,
        childName: name,
        title: a.status === 'absent' ? `Absence de ${name}` : `Retard de ${name}`,
        body: a.reason || `Signalé par ${a.recordedByName}`,
      });
    }
    for (const p of c.payments) {
      if (p.createdAt < since) continue;
      items.push({
        id: `pay-${p.id}`,
        kind: 'payment',
        at: p.createdAt,
        childId: c.id,
        childName: name,
        title: `Paiement reçu : ${p.amount} ${c.currency}`,
        body: `${p.feeName} · reçu ${p.reference}`,
      });
    }
    for (const k of c.conduct) {
      if (k.createdAt < since) continue;
      items.push({ id: `cond-${k.id}`, kind: 'conduct', at: k.createdAt, childId: c.id, childName: name, title: `${k.type} · ${name}`, body: k.title });
    }
    for (const h of c.homework) {
      if (h.createdAt < since) continue;
      items.push({ id: `hw-${h.id}-${c.id}`, kind: 'homework', at: h.createdAt, childId: c.id, childName: name, title: `Nouveau devoir de ${h.subject}`, body: h.title });
    }
    for (const a of c.announcements) {
      if (a.publishedAt < since || announced.has(a.id)) continue;
      announced.add(a.id);
      items.push({ id: `ann-${a.id}`, kind: 'announcement', at: a.publishedAt, childId: null, childName: null, title: a.title, body: a.content });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
