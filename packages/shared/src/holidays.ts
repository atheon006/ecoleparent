import { addDays, parseISODate } from './dates';
import type { ISODate, SchoolEvent } from './types';

// Jours fériés légaux de la RDC : ordonnance n° 23/042 du 30 mars 2023 (dix jours).
// Si le gouvernement change la liste, il suffit de modifier ce tableau. Un jour de report
// décidé ponctuellement (férié tombant un dimanche) s'ajoute par l'école comme « Congé ».

export interface Holiday {
  date: ISODate;
  name: string;
}

const NATIONAL: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: 'Nouvel An' },
  { month: 1, day: 4, name: "Journée des martyrs de l'indépendance" },
  { month: 1, day: 16, name: 'Journée du héros national Laurent-Désiré Kabila' },
  { month: 1, day: 17, name: 'Journée du héros national Patrice Emery Lumumba' },
  { month: 4, day: 6, name: 'Journée du combat de Simon Kimbangu et de la conscience africaine' },
  { month: 5, day: 1, name: 'Fête du travail' },
  { month: 5, day: 17, name: 'Journée de la révolution et des forces armées' },
  { month: 6, day: 30, name: "Fête de l'indépendance" },
  { month: 8, day: 1, name: 'Fête des parents' },
  { month: 12, day: 25, name: 'Noël' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Les jours fériés d'une année civile, dans l'ordre. */
export function nationalHolidays(year: number): Holiday[] {
  return NATIONAL.map((h) => ({ date: `${year}-${pad(h.month)}-${pad(h.day)}`, name: h.name }));
}

/** Le jour férié de cette date, ou null. */
export function holidayOn(date: ISODate): Holiday | null {
  const [, m, d] = date.split('-').map(Number);
  const h = NATIONAL.find((x) => x.month === m && x.day === d);
  return h ? { date, name: h.name } : null;
}

/** Jours fériés compris entre deux dates (incluses). */
export function holidaysBetween(from: ISODate, to: ISODate): Holiday[] {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const out: Holiday[] = [];
  for (let y = y1; y <= y2; y++) out.push(...nationalHolidays(y).filter((h) => h.date >= from && h.date <= to));
  return out;
}

/** Vrai si la date tombe dans un « Congé » de l'agenda de l'école (un jour ou une période). */
export function schoolBreakOn(date: ISODate, events: Pick<SchoolEvent, 'date' | 'endDate' | 'category' | 'title'>[]): Pick<SchoolEvent, 'title'> | null {
  return events.find((e) => e.category === 'Congé' && date >= e.date && date <= (e.endDate || e.date)) ?? null;
}

export interface NoSchoolOptions {
  /** Agenda de l'école (les « Congé » comptent comme jours sans cours). */
  events?: Pick<SchoolEvent, 'date' | 'endDate' | 'category' | 'title'>[];
  /** L'école a cours le samedi. */
  saturdayClasses?: boolean;
}

/**
 * Pourquoi il n'y a pas cours ce jour-là : « Dimanche », un jour férié, un congé de l'école…
 * null = jour de classe.
 */
export function noSchoolReason(date: ISODate, opts: NoSchoolOptions = {}): string | null {
  const weekday = parseISODate(date).getDay();
  const holiday = holidayOn(date);
  if (holiday) return holiday.name;
  const brk = opts.events ? schoolBreakOn(date, opts.events) : null;
  if (brk) return brk.title;
  if (weekday === 0) return 'Dimanche';
  if (weekday === 6 && !opts.saturdayClasses) return 'Samedi';
  return null;
}

/** Prochain jour de classe après `date` (exclue). */
export function nextSchoolDay(date: ISODate, opts: NoSchoolOptions = {}): ISODate {
  let d = addDays(date, 1);
  for (let i = 0; i < 60 && noSchoolReason(d, opts); i++) d = addDays(d, 1);
  return d;
}
