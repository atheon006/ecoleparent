import {
  PERIODS,
  WEEKDAY_LABELS,
  addDays,
  bulletinId,
  formatLongCap,
  formatShort,
  noSchoolReason,
  parseISODate,
  runningPercent,
  todayISO,
  type Grade,
  type PeriodId,
  type Weekday,
} from '@pe/shared';
import { cx } from '@pe/shared/ui';
import { useState } from 'react';
import { RootHeader } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { EmptyState, List, Note, Pill, Section, Seg, Tile, percentColor } from '../components/kit';
import { useParentData, type Child } from '../data';
import { currentPeriod, fmtNum, subjectStyle, yearGrades, yearOf } from '../helpers';
import type { Nav, SchoolSeg } from '../nav';
import { AttendanceView } from './Attendance';
import { HomeworkView } from './Homework';

export function Scolarite({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  if (!active) return null;
  return (
    <div>
      <RootHeader title="Scolarité" subtitle={`${active.student.firstName} · ${active.student.className}`} nav={nav} />
      <Seg<SchoolSeg>
        label="Rubriques"
        value={nav.seg}
        onChange={nav.setSeg}
        options={[
          { value: 'notes', label: 'Notes' },
          { value: 'devoirs', label: 'Devoirs' },
          { value: 'presences', label: 'Présences' },
          { value: 'horaire', label: 'Horaire' },
        ]}
      />
      {nav.seg === 'notes' && <GradesView key={active.id} child={active} nav={nav} />}
      {nav.seg === 'devoirs' && <HomeworkView child={active} />}
      {nav.seg === 'presences' && <AttendanceView child={active} />}
      {nav.seg === 'horaire' && <TimetableView key={active.id} child={active} />}
    </div>
  );
}

// ── Notes ──────────────────────────────────────────────────────────────────

const ratio = (sum: number, max: number) => (max ? Math.round((sum / max) * 1000) / 10 : null);

function GradesView({ child: c, nav }: { child: Child; nav: Nav }) {
  const [period, setPeriod] = useState<PeriodId>(() => currentPeriod(c));
  const [open, setOpen] = useState<string | null>(null);
  const year = yearOf(c);
  const grades = yearGrades(c).filter((g) => g.period === period);
  const pct = runningPercent(grades, period);
  const evals = c.evaluations.filter((e) => e.year === year && e.period === period && e.count > 0);
  const classPct = ratio(
    evals.reduce((a, e) => a + e.average, 0),
    evals.reduce((a, e) => a + e.max, 0),
  );
  const bulletin = c.bulletins.find((b) => b.id === bulletinId(year, period));
  const evalById = new Map(c.evaluations.map((e) => [e.id, e]));

  // Branches de la classe ; à défaut, celles des notes reçues.
  const subjects = c.classRoom?.subjects?.length
    ? c.classRoom.subjects.map((s) => ({ id: s.id, name: s.name }))
    : [...new Map(grades.map((g) => [g.subjectId, { id: g.subjectId, name: g.subjectName }])).values()];
  const bySubject = (id: string) => grades.filter((g) => g.subjectId === id);

  return (
    <>
      <div className="flex items-center justify-between px-5 pt-4">
        <label className="relative flex items-center">
          <span className="sr-only">Période</span>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as PeriodId);
              setOpen(null);
            }}
            className="h-9 appearance-none rounded-[10px] bg-muted py-0 pr-8 pl-3 text-sm font-semibold text-ink"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Icon name="caret-down" size={16} className="pointer-events-none absolute right-2.5 text-ink-3" />
        </label>
        <button type="button" onClick={() => nav.push({ name: 'bulletins' })} className="min-h-9 text-sm font-semibold text-brand">
          Bulletins
        </button>
      </div>
      {pct === null ? (
        <EmptyState icon="hourglass" title="Pas encore de notes">
          Aucune note pour la {PERIODS.find((p) => p.id === period)?.label.toLowerCase()}. Elles s'afficheront ici au fil des interrogations, dès que l'enseignant les encode.
        </EmptyState>
      ) : (
        <>
          <section className="px-5 pt-[18px]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[13px] text-ink-3">{bulletin ? 'Pourcentage du bulletin' : 'Moyenne provisoire'}</div>
                <div className="text-[40px] leading-[1.1] font-semibold tracking-tight tabular-nums">{fmtNum(bulletin?.percent ?? pct)} %</div>
              </div>
              <div className="text-right text-[13px] text-ink-3">
                {bulletin?.rank && (
                  <div className="font-semibold text-ink">
                    {bulletin.rank === 1 ? '1re' : `${bulletin.rank}e`} place sur {bulletin.classSize}
                  </div>
                )}
                {classPct !== null && (
                  <div>
                    Classe <span className="font-semibold text-ink-2 tabular-nums">{fmtNum(classPct)} %</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3.5 grid gap-1.5">
              <Bar value={pct} fill="bg-brand" />
              {classPct !== null && <Bar value={classPct} fill="bg-[#b9c0ba]" />}
              <div className="flex gap-4 text-xs text-ink-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand" />
                  {c.student.firstName}
                </span>
                {classPct !== null && (
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#b9c0ba]" />
                    Moyenne de la classe
                  </span>
                )}
              </div>
            </div>
          </section>

          <Section title="Par branche" />
          <List>
            {subjects.map((s) => {
              const gs = bySubject(s.id);
              const p = runningPercent(gs, period);
              const st = subjectStyle(s.name);
              const last = gs.find((g) => g.score !== null);
              const expanded = open === s.id;
              return (
                <div key={s.id}>
                  <button type="button" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded} className="flex w-full items-center gap-3.5 py-3 pr-5 text-left">
                    <Tile icon={st.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{s.name}</span>
                      <span className="block text-[13px] text-ink-3">
                        {last ? `${gs.length > 1 ? `${gs.length} notes · dernière le` : '1 note ·'} ${formatShort(last.date)}` : 'Pas encore de note'}
                      </span>
                    </span>
                    <span className={cx('text-[15px] font-semibold tabular-nums', p === null ? 'text-ink-4' : percentColor(p))}>{p === null ? '—' : `${fmtNum(p)} %`}</span>
                    <Icon name="caret-down" size={18} className={cx('text-ink-4 transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && gs.length > 0 && (
                    <ul className="mr-5 mb-3 flex flex-col gap-2 rounded-xl bg-ground p-3">
                      {gs.map((g) => (
                        <GradeLine key={g.id} g={g} classAvg={evalById.get(g.evaluationId)?.average} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </List>
          <Note>Les notes apparaissent dès que l'enseignant les encode. La moyenne officielle figure sur le bulletin.</Note>
        </>
      )}
    </>
  );
}

function GradeLine({ g, classAvg }: { g: Grade; classAvg?: number }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium">{g.title}</span>
        <span className="text-xs text-ink-3">
          {formatShort(g.date)}
          {classAvg !== undefined ? ` · classe ${fmtNum(classAvg)}/${fmtNum(g.max)}` : ''}
        </span>
      </span>
      {g.score === null ? (
        <Pill>Absent</Pill>
      ) : (
        <span className={cx('text-[15px] font-semibold tabular-nums', percentColor((g.score / g.max) * 100))}>
          {fmtNum(g.score)}/{fmtNum(g.max)}
        </span>
      )}
    </li>
  );
}

function Bar({ value, fill, className }: { value: number; fill: string; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded bg-muted', className)}>
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// ── Horaire ────────────────────────────────────────────────────────────────

/** Lundi de la semaine d'une date (le week-end montre la semaine suivante). */
function weekStart(today: string): string {
  const day = parseISODate(today).getDay();
  if (day === 0) return addDays(today, 1);
  if (day === 6) return addDays(today, 2);
  return addDays(today, 1 - day);
}

function TimetableView({ child: c }: { child: Child }) {
  const today = todayISO();
  const saturday = !!c.school?.saturdayClasses;
  const monday = weekStart(today);
  const days = Array.from({ length: saturday ? 6 : 5 }, (_, i) => addDays(monday, i));
  const [date, setDate] = useState(() => (days.includes(today) ? today : monday));
  const slots = c.timetable?.slots ?? [];
  const weekday = parseISODate(date).getDay() as Weekday;
  const daySlots = slots.filter((s) => s.day === weekday).sort((a, b) => a.start.localeCompare(b.start));
  const off = noSchoolReason(date, { events: c.events, saturdayClasses: saturday });

  if (!slots.length) {
    return (
      <EmptyState icon="clock" tone="b" title="Horaire pas encore publié">
        L'école n'a pas encore saisi l'horaire de la {c.student.className}.
      </EmptyState>
    );
  }

  return (
    <>
      <div role="group" aria-label="Jour" className="flex justify-between gap-1.5 px-4 pt-0.5">
        {days.map((d) => {
          const holiday = noSchoolReason(d, { events: c.events, saturdayClasses: saturday });
          return (
            <button
              key={d}
              type="button"
              aria-pressed={d === date}
              onClick={() => setDate(d)}
              className={cx(
                'relative flex h-14 flex-1 flex-col items-center justify-center rounded-2xl border text-[11.5px] font-semibold',
                d === date ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-2',
              )}
            >
              <span>{WEEKDAY_LABELS[parseISODate(d).getDay() as Weekday].slice(0, 3)}.</span>
              <span className="text-lg leading-none font-semibold">{parseISODate(d).getDate()}</span>
              {holiday && <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-danger" aria-label="Pas de cours" />}
            </button>
          );
        })}
      </div>
      {off ? (
        <EmptyState icon="calendar-x" tone="c" title="Pas de cours">
          {off} · {formatLongCap(date)}
        </EmptyState>
      ) : daySlots.length === 0 ? (
        <EmptyState icon="calendar-blank" tone="b" title="Pas de cours ce jour-là" />
      ) : (
        <List className="mt-2.5">
          {daySlots.map((s, i) => {
            const pause = /r[ée]cr[ée]ation|pause/i.test(s.subject);
            const st = subjectStyle(s.subject);
            return (
              <div key={i} className={cx('flex items-center gap-3 px-4 py-3', pause && 'bg-muted/60')}>
                <span className="w-11 text-[13px] font-semibold tabular-nums">{s.start}</span>
                {!pause && <Tile icon={st.icon} tone={st.tone} />}
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[15px]', pause ? 'font-semibold text-ink-3' : 'font-semibold')}>{s.subject}</span>
                  {!pause && (
                    <span className="block text-[13px] text-ink-3">{[s.teacher, s.room, `jusqu'à ${s.end}`].filter(Boolean).join(' · ')}</span>
                  )}
                </span>
                {pause && <span className="text-xs text-ink-3">jusqu'à {s.end}</span>}
              </div>
            );
          })}
        </List>
      )}
      <Note icon="info">
        Semaine du {formatShort(monday)} au {formatShort(addDays(monday, days.length - 1))} · un point rouge signale un jour sans cours (férié ou congé).
      </Note>
    </>
  );
}
