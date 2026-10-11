import { CONDUCT_TYPES, PERIODS, addDays, holidaysBetween, schoolYear, todayISO, type Conduct, type PeriodId, type SchoolEvent } from '@pe/shared';
import type { IconName } from './components/Icon';
import type { Tone } from './components/kit';
import type { Child } from './data';

/** Année scolaire de l'école de l'enfant (réglée par l'école, sinon déduite de la date). */
export const yearOf = (c: Child) => c.school?.schoolYear || schoolYear();

/** Notes de l'année en cours. */
export const yearGrades = (c: Child) => c.grades.filter((g) => g.year === yearOf(c));

/** Période en cours : celle de la note la plus récente de l'année, sinon la 1re. */
export function currentPeriod(c: Child): PeriodId {
  const g = yearGrades(c)[0];
  return g?.period ?? PERIODS[0].id;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const SUBJECT_ICONS: [RegExp, IconName, Tone][] = [
  [/math|calcul|arithm|geometr|algebr/, 'math-operations', 'b'],
  [/franc|lecture|grammaire|conjug|dictee|orthogr|redaction|langage/, 'book-open-text', 'g'],

  [/geograph/, 'globe-hemisphere-east', 'c'],
  [/histoire/, 'scroll', 'a'],
  [/anglais|swahili|lingala|kikongo|tshiluba|langue|english/, 'translate', 'v'],
  [/dessin|art|coloriage|musique|chant/, 'palette', 'c'],
  [/education physique|sport|gym/, 'person-simple-run', 't'],
  [/physique|chimie|biolog|science|eveil/, 'flask', 't'],
  [/ecriture|calligraph/, 'pen-nib', 'v'],
  [/civique|morale|citoyen/, 'scales', 'a'],
  [/religion|bible/, 'sparkle', 'a'],
  [/informatique|ordinateur|technolog/, 'devices', 'b'],
];

/** Icône et couleur d'une branche, d'après son nom. */
export function subjectStyle(name: string): { icon: IconName; tone: Tone } {
  const n = norm(name);
  const hit = SUBJECT_ICONS.find(([re]) => re.test(n));
  return hit ? { icon: hit[1], tone: hit[2] } : { icon: 'notebook', tone: 'g' };
}

/** Taux de présence du mois en cours (présent ou en retard), null sans appel. */
export function monthPresence(c: Child, today = todayISO()): number | null {
  const month = today.slice(0, 7);
  const recs = c.attendance.filter((a) => a.date.startsWith(month));
  if (!recs.length) return null;
  const ok = recs.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'excused').length;
  return Math.round((ok / recs.length) * 100);
}

export type AgendaItem =
  | { kind: 'event'; date: string; endDate?: string; event: SchoolEvent }
  | { kind: 'holiday'; date: string; name: string };

/** Agenda de l'enfant (événements de l'école et jours fériés légaux), à partir de `from`. */
export function agendaItems(c: Child, from = todayISO(), days = 365): AgendaItem[] {
  const to = addDays(from, days);
  const events: AgendaItem[] = c.events
    .filter((e) => (e.endDate || e.date) >= from && e.date <= to)
    .map((e) => ({ kind: 'event', date: e.date, endDate: e.endDate, event: e }));
  const holidays: AgendaItem[] = holidaysBetween(from, to).map((h) => ({ kind: 'holiday', date: h.date, name: h.name }));
  return [...events, ...holidays].sort((a, b) => a.date.localeCompare(b.date));
}

export const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);

/** « Furaha Kabibi » → « FK » ; « Collège de la Grâce » → « CG ». */
export function nameInitials(name: string): string {
  const words = name.split(/[\s'’-]+/).filter((w) => w.length > 2 || /^[A-ZÉ]/.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Points de conduite d'une note (ceux de son type si la note n'en précise pas). */
export const conductPoints = (k: Conduct) => k.points ?? CONDUCT_TYPES.find((t) => t.type === k.type)?.points ?? 0;
