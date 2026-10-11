import { schoolYear, type ClassRoom, type FeeCategory, type Member, type Payment, type School, type Student } from '@pe/shared';
import { q, refs } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveDoc, useLiveQuery } from '@pe/shared/hooks';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAccess, useRole } from './access';

export interface SchoolData {
  schoolId: string;
  school: School | null;
  currency: string;
  /** Année scolaire en cours, ex. « 2026-2027 » (paramètres de l'école, sinon déduite de la date). */
  year: string;
  classes: ClassRoom[];
  students: Student[];
  fees: FeeCategory[];
  /** Personnel (lisible par la direction seulement). */
  members: Member[];
  /** Paiements de l'école (direction et caisse seulement). */
  payments: Payment[];
  loading: boolean;
  /** Erreur de lecture (accès refusé, réseau) sur les données de base. */
  error: Error | null;
  classById: Map<string, ClassRoom>;
  studentById: Map<string, Student>;
  /** Classes que l'utilisateur peut gérer (appel, devoirs) : toutes, ou celles d'un professeur. */
  myClasses: ClassRoom[];
}

const Ctx = createContext<SchoolData | null>(null);

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { numeric: true });
const byStudent = (a: Student, b: Student) =>
  a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr');

export function SchoolDataProvider({ schoolId, children }: { schoolId: string; children: ReactNode }) {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const canSeeMoney = role === 'admin' || role === 'caissier';

  const school = useLiveDoc<School>(`school:${schoolId}`, () => refs.school(db, schoolId));
  const classes = useLiveQuery<ClassRoom>(`classes:${schoolId}`, () => q.classes(db, schoolId));
  const students = useLiveQuery<Student>(`students:${schoolId}`, () => q.students(db, schoolId));
  const fees = useLiveQuery<FeeCategory>(`fees:${schoolId}`, () => q.fees(db, schoolId));
  const members = useLiveQuery<Member>(role === 'admin' ? `members:${schoolId}` : null, () => q.members(db, schoolId));
  const payments = useLiveQuery<Payment>(canSeeMoney ? `payments:${schoolId}` : null, () => q.schoolPayments(db, schoolId, 5000));

  const value = useMemo<SchoolData>(() => {
    const cls = [...classes.data].sort(byName);
    const studs = [...students.data].sort(byStudent);
    const mine = role === 'professeur' ? cls.filter((c) => access.member?.classIds.includes(c.id)) : cls;
    return {
      schoolId,
      school: school.data,
      currency: school.data?.currency ?? '$',
      year: school.data?.schoolYear || schoolYear(),
      classes: cls,
      students: studs,
      fees: [...fees.data].sort(byName),
      members: [...members.data].sort(byName),
      payments: payments.data,
      loading: school.loading || classes.loading || students.loading || fees.loading,
      error: school.error ?? classes.error ?? students.error ?? fees.error,
      classById: new Map(cls.map((c) => [c.id, c])),
      studentById: new Map(studs.map((s) => [s.id, s])),
      myClasses: mine,
    };
  }, [schoolId, school, classes, students, fees, members, payments, role, access.member]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSchool(): SchoolData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSchool doit être utilisé dans <SchoolDataProvider>.');
  return ctx;
}

/** Recherche insensible aux accents et à la casse. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function matchStudent(s: Student, query: string): boolean {
  const qn = norm(query);
  if (!qn) return true;
  return norm(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName} ${s.matricule} ${s.parentName} ${s.parentPhone}`).includes(qn);
}

export const fullName = (s: Pick<Student, 'firstName' | 'lastName'>) => `${s.lastName.toUpperCase()} ${s.firstName}`;
