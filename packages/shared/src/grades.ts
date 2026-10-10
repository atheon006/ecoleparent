import type { BulletinLine, BulletinPeriod, Grade, PeriodId, Subject } from './types';

// Calcul des notes et des bulletins selon le système de la RDC : chaque branche a un maximum
// par période (et le double à l'examen) ; les notes des évaluations d'une période sont ramenées
// à ce maximum ; le bulletin additionne les branches et donne un pourcentage et une place.

export interface PeriodInfo {
  id: PeriodId;
  label: string;
  short: string;
  semester: 1 | 2;
  exam: boolean;
}

export const PERIODS: PeriodInfo[] = [
  { id: 'P1', label: '1re période', short: '1re P.', semester: 1, exam: false },
  { id: 'P2', label: '2e période', short: '2e P.', semester: 1, exam: false },
  { id: 'EX1', label: 'Examen du 1er semestre', short: 'Examen S1', semester: 1, exam: true },
  { id: 'P3', label: '3e période', short: '3e P.', semester: 2, exam: false },
  { id: 'P4', label: '4e période', short: '4e P.', semester: 2, exam: false },
  { id: 'EX2', label: 'Examen du 2e semestre', short: 'Examen S2', semester: 2, exam: true },
];

export const PERIOD_BY_ID = Object.fromEntries(PERIODS.map((p) => [p.id, p])) as Record<PeriodId, PeriodInfo>;

export interface BulletinPeriodInfo {
  id: BulletinPeriod;
  label: string;
  parts: PeriodId[];
}

export const BULLETIN_PERIODS: BulletinPeriodInfo[] = [
  { id: 'P1', label: '1re période', parts: ['P1'] },
  { id: 'P2', label: '2e période', parts: ['P2'] },
  { id: 'EX1', label: 'Examen du 1er semestre', parts: ['EX1'] },
  { id: 'S1', label: '1er semestre', parts: ['P1', 'P2', 'EX1'] },
  { id: 'P3', label: '3e période', parts: ['P3'] },
  { id: 'P4', label: '4e période', parts: ['P4'] },
  { id: 'EX2', label: 'Examen du 2e semestre', parts: ['EX2'] },
  { id: 'S2', label: '2e semestre', parts: ['P3', 'P4', 'EX2'] },
  { id: 'AN', label: 'Bilan annuel', parts: ['P1', 'P2', 'EX1', 'P3', 'P4', 'EX2'] },
];

export const BULLETIN_PERIOD_BY_ID = Object.fromEntries(BULLETIN_PERIODS.map((p) => [p.id, p])) as Record<BulletinPeriod, BulletinPeriodInfo>;

/** Identifiant d'un bulletin : « 2026-2027_P1 ». */
export const bulletinId = (year: string, period: BulletinPeriod) => `${year}_${period}`;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Maximum d'une branche pour une période (le double à l'examen, sauf maximum d'examen précisé). */
export function periodMax(subject: Pick<Subject, 'max' | 'examMax'>, period: PeriodId): number {
  return PERIOD_BY_ID[period].exam ? (subject.examMax ?? subject.max * 2) : subject.max;
}

/** Notes prises en compte : notées (pas absent) et sur un maximum positif. */
const graded = (g: Grade) => g.score !== null && g.score !== undefined && g.max > 0;

/**
 * Points d'une branche pour une période : somme des notes ramenée au maximum de la branche.
 * Ex. 14/20 et 8/10 avec une branche sur 10 → (22/30) × 10 = 7,3. null si rien n'est noté.
 */
export function subjectPeriodPoints(grades: Grade[], subject: Subject, period: PeriodId): number | null {
  const gs = grades.filter((g) => g.subjectId === subject.id && g.period === period && graded(g));
  if (!gs.length) return null;
  const sum = gs.reduce((a, g) => a + (g.score as number), 0);
  const max = gs.reduce((a, g) => a + g.max, 0);
  return round1((sum / max) * periodMax(subject, period));
}

/**
 * Lignes d'un bulletin. Seules les parties déjà notées comptent dans le maximum : un semestre
 * en cours n'est pas pénalisé par l'examen qui n'a pas encore eu lieu.
 */
export function computeBulletinLines(grades: Grade[], subjects: Subject[], period: BulletinPeriod): BulletinLine[] {
  const parts = BULLETIN_PERIOD_BY_ID[period].parts;
  return subjects.map((s) => {
    let max = 0;
    let fullMax = 0;
    let points = 0;
    let any = false;
    for (const p of parts) {
      const m = periodMax(s, p);
      fullMax += m;
      const v = subjectPeriodPoints(grades, s, p);
      if (v !== null) {
        any = true;
        max += m;
        points += v;
      }
    }
    return { subjectId: s.id, subject: s.name, max: any ? max : fullMax, points: any ? round1(points) : null };
  });
}

export interface BulletinTotals {
  totalMax: number;
  totalPoints: number;
  /** Pourcentage arrondi au dixième (0 si rien n'est noté). */
  percent: number;
}

/** Total et pourcentage d'un bulletin (branches notées seulement). */
export function bulletinTotals(lines: BulletinLine[]): BulletinTotals {
  const done = lines.filter((l) => l.points !== null);
  const totalMax = done.reduce((a, l) => a + l.max, 0);
  const totalPoints = round1(done.reduce((a, l) => a + (l.points as number), 0));
  return { totalMax, totalPoints, percent: totalMax ? round1((totalPoints / totalMax) * 100) : 0 };
}

/** Places dans la classe : 1 = meilleur pourcentage ; les ex æquo partagent la même place. */
export function rankByPercent(entries: { id: string; percent: number | null }[]): Map<string, number> {
  const sorted = entries.filter((e) => e.percent !== null).sort((a, b) => (b.percent as number) - (a.percent as number));
  const ranks = new Map<string, number>();
  let prev: number | null = null;
  let rank = 0;
  sorted.forEach((e, i) => {
    if (prev === null || e.percent !== prev) rank = i + 1;
    ranks.set(e.id, rank);
    prev = e.percent;
  });
  return ranks;
}

/** Moyenne provisoire en pourcentage (toutes notes de la période, ou d'une branche). */
export function runningPercent(grades: Grade[], period: PeriodId, subjectId?: string): number | null {
  const gs = grades.filter((g) => g.period === period && graded(g) && (!subjectId || g.subjectId === subjectId));
  if (!gs.length) return null;
  const sum = gs.reduce((a, g) => a + (g.score as number), 0);
  const max = gs.reduce((a, g) => a + g.max, 0);
  return round1((sum / max) * 100);
}

/** Moyenne d'une liste de notes (null si personne n'est noté). */
export function averageScore(scores: (number | null)[]): number | null {
  const v = scores.filter((s): s is number => s !== null && s !== undefined && !Number.isNaN(s));
  return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** « 79,5 % » */
export const formatPercent = (p: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(p)} %`;

/** « 1re », « 2e », « 3e »… */
export const ordinal = (n: number) => (n === 1 ? '1re' : `${n}e`);
