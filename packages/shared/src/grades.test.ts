import { describe, expect, it } from 'vitest';
import { bulletinTotals, computeBulletinLines, periodMax, rankByPercent, runningPercent, subjectPeriodPoints } from './grades';
import { holidayOn, holidaysBetween, nextSchoolDay, noSchoolReason } from './holidays';
import type { Grade, Subject } from './types';

const francais: Subject = { id: 'fr', name: 'Français', max: 10 };
const maths: Subject = { id: 'ma', name: 'Mathématiques', max: 20, examMax: 50 };

function grade(subjectId: string, period: Grade['period'], score: number | null, max: number, n = Math.random()): Grade {
  return {
    id: `e${n}`, evaluationId: `e${n}`, studentId: 's1', schoolId: 'sc', classId: 'c1', subjectId, subjectName: subjectId, year: '2026-2027',
    period, title: 'Interro', date: '2026-10-08', score, max, createdBy: 'prof@x.cd', updatedAt: '2026-10-08T10:00:00Z',
  };
}

describe('maxima', () => {
  it("vaut le double à l'examen, sauf maximum d'examen précisé", () => {
    expect(periodMax(francais, 'P1')).toBe(10);
    expect(periodMax(francais, 'EX1')).toBe(20);
    expect(periodMax(maths, 'EX1')).toBe(50);
  });
});

describe('points de période', () => {
  it('ramène les notes au maximum de la branche', () => {
    const g = [grade('fr', 'P1', 14, 20, 1), grade('fr', 'P1', 8, 10, 2)];
    expect(subjectPeriodPoints(g, francais, 'P1')).toBe(7.3);
  });
  it('ignore les absents et renvoie null sans note', () => {
    expect(subjectPeriodPoints([grade('fr', 'P1', null, 20, 1)], francais, 'P1')).toBeNull();
    expect(subjectPeriodPoints([grade('fr', 'P1', 10, 20, 1), grade('fr', 'P1', null, 20, 2)], francais, 'P1')).toBe(5);
  });
});

describe('bulletin', () => {
  const grades = [grade('fr', 'P1', 16, 20, 1), grade('ma', 'P1', 18, 20, 2), grade('fr', 'P2', 12, 20, 3)];

  it("calcule les lignes et le pourcentage d'une période", () => {
    const lines = computeBulletinLines(grades, [francais, maths], 'P1');
    expect(lines).toEqual([
      { subjectId: 'fr', subject: 'Français', max: 10, points: 8 },
      { subjectId: 'ma', subject: 'Mathématiques', max: 20, points: 18 },
    ]);
    expect(bulletinTotals(lines)).toEqual({ totalMax: 30, totalPoints: 26, percent: 86.7 });
  });

  it("ne pénalise pas un semestre en cours (parties non notées hors maximum)", () => {
    const lines = computeBulletinLines(grades, [francais, maths], 'S1');
    // Français : P1 (8/10) + P2 (6/10), examen pas encore noté → 14/20 ; Maths : P1 seulement → 18/20.
    expect(lines[0]).toMatchObject({ max: 20, points: 14 });
    expect(lines[1]).toMatchObject({ max: 20, points: 18 });
    expect(bulletinTotals(lines).percent).toBe(80);
  });

  it('laisse une branche non notée hors du total', () => {
    const lines = computeBulletinLines([grade('fr', 'P1', 10, 20, 1)], [francais, maths], 'P1');
    expect(lines[1].points).toBeNull();
    expect(bulletinTotals(lines)).toEqual({ totalMax: 10, totalPoints: 5, percent: 50 });
  });
});

describe('classement', () => {
  it('donne la même place aux ex æquo et saute les places suivantes', () => {
    const r = rankByPercent([
      { id: 'a', percent: 80 },
      { id: 'b', percent: 92.5 },
      { id: 'c', percent: 80 },
      { id: 'd', percent: 61 },
      { id: 'e', percent: null },
    ]);
    expect([r.get('b'), r.get('a'), r.get('c'), r.get('d'), r.get('e')]).toEqual([1, 2, 2, 4, undefined]);
  });
});

describe('moyenne provisoire', () => {
  it('additionne toutes les notes de la période', () => {
    const g = [grade('fr', 'P1', 16, 20, 1), grade('ma', 'P1', 9, 10, 2), grade('ma', 'P2', 1, 10, 3)];
    expect(runningPercent(g, 'P1')).toBe(83.3);
    expect(runningPercent(g, 'P1', 'ma')).toBe(90);
    expect(runningPercent(g, 'P3')).toBeNull();
  });
});

describe('jours fériés et jours sans cours', () => {
  it('reconnaît les jours fériés légaux', () => {
    expect(holidayOn('2027-01-17')?.name).toBe('Journée du héros national Patrice Emery Lumumba');
    expect(holidayOn('2026-06-30')?.name).toBe("Fête de l'indépendance");
    expect(holidayOn('2026-10-10')).toBeNull();
  });
  it('liste ceux d’une année scolaire', () => {
    const list = holidaysBetween('2026-09-01', '2027-07-31').map((h) => h.date);
    expect(list).toEqual(['2026-12-25', '2027-01-01', '2027-01-04', '2027-01-16', '2027-01-17', '2027-04-06', '2027-05-01', '2027-05-17', '2027-06-30']);
  });
  it("donne la raison d'un jour sans cours", () => {
    expect(noSchoolReason('2026-10-11')).toBe('Dimanche'); // dimanche
    expect(noSchoolReason('2026-10-10')).toBe('Samedi');
    expect(noSchoolReason('2026-10-10', { saturdayClasses: true })).toBeNull();
    expect(noSchoolReason('2026-10-13', { events: [{ date: '2026-10-13', category: 'Congé', title: 'Journée pédagogique' }] })).toBe('Journée pédagogique');
    expect(noSchoolReason('2026-12-28', { events: [{ date: '2026-12-19', endDate: '2027-01-03', category: 'Congé', title: 'Vacances de Noël' }] })).toBe('Vacances de Noël');
    expect(noSchoolReason('2026-10-12')).toBeNull();
  });
  it('trouve le prochain jour de classe', () => {
    expect(nextSchoolDay('2026-10-09')).toBe('2026-10-12'); // vendredi → lundi
    expect(nextSchoolDay('2027-01-15')).toBe('2027-01-18'); // 16 et 17 fériés + week-end
  });
});
