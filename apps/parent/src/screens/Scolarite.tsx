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
import { Btn, Chips, EmptyState, List, Note, Pill, Section, Seg, Tile, percentColor } from '../components/kit';
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
      <Chips
        label="Période"
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setOpen(null);
        }}
        options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
      />
      {pct === null ? (
        <EmptyState icon="hourglass" title="Pas encore de notes">
          Aucune note pour la {PERIODS.find((p) => p.id === period)?.label.toLowerCase()}. Elles s'afficheront ici au fil des interrogations, dès que l'enseignant les encode.
        </EmptyState>
      ) : (
        <>
          <div className="pe-card mx-4 mt-2.5 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[12.5px] font-semibold text-ink-3">{bulletin ? 'Pourcentage du bulletin' : 'Moyenne provisoire'}</div>
                <div className="font-display text-[40px] leading-[1.05] font-extrabold tabular-nums">
                  {fmtNum(bulletin?.percent ?? pct)}
                  <span className="text-[22px]"> %</span>
                </div>
              </div>
              <div className="text-right">
                {bulletin?.rank && (
                  <Pill tone="ok" icon="trophy">
                    Place : {bulletin.rank === 1 ? '1re' : `${bulletin.rank}e`} sur {bulletin.classSize}
                  </Pill>
                )}
                {classPct !== null && <div className="mt-1.5 text-xs text-ink-3">Classe : {fmtNum(classPct)} %</div>}
              </div>
            </div>
            <div className="mt-3.5 grid gap-1.5 text-xs text-ink-3">
              <div className="flex justify-between">
                <span>{c.student.firstName}</span>
                <span>{fmtNum(pct)} %</span>
              </div>
              <Bar value={pct} fill="bg-brand" />
              {classPct !== null && (
                <>
                  <div className="flex justify-between">
                    <span>Moyenne de la classe</span>
                    <span>{fmtNum(classPct)} %</span>
                  </div>
                  <Bar value={classPct} fill="bg-ink-3/50" />
                </>
              )}
            </div>
          </div>

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
                  <button type="button" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                    <Tile icon={st.icon} tone={st.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2">
                        <span className="text-[15px] font-bold">{s.name}</span>
                        <span className={cx('font-display text-[15px] font-extrabold tabular-nums', p === null ? 'text-ink-3' : percentColor(p))}>{p === null ? '—' : `${fmtNum(p)} %`}</span>
                      </span>
                      <span className="block text-[13px] text-ink-3">
                        {last ? `${last.title} · ${formatShort(last.date)}` : 'Pas encore de note'}
                        {gs.length > 1 ? ` · ${gs.length} notes` : ''}
                      </span>
                      {p !== null && <Bar value={p} className="mt-2 h-1.5" fill={p >= 70 ? 'bg-[var(--ok)]' : p >= 50 ? 'bg-chalk' : 'bg-danger'} />}
                    </span>
                  </button>
                  {expanded && gs.length > 0 && (
                    <ul className="mx-4 mb-3 flex flex-col gap-1.5 rounded-2xl bg-ground p-3">
                      {gs.map((g) => (
                        <GradeLine key={g.id} g={g} classAvg={evalById.get(g.evaluationId)?.average} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </List>
          <div className="mx-4 mt-3.5">
            <Btn variant="ghost" block icon="certificate" onClick={() => nav.push({ name: 'bulletins' })}>
              Voir les bulletins
            </Btn>
          </div>
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
        <span className="block truncate font-semibold">{g.title}</span>
        <span className="text-xs text-ink-3">
          {formatShort(g.date)}
          {classAvg !== undefined ? ` · classe ${fmtNum(classAvg)}/${fmtNum(g.max)}` : ''}
        </span>
      </span>
      {g.score === null ? (
        <Pill>Absent</Pill>
      ) : (
        <span className={cx('font-display text-base font-extrabold tabular-nums', percentColor((g.score / g.max) * 100))}>
          {fmtNum(g.score)}/{fmtNum(g.max)}
        </span>
      )}
    </li>
  );
}

function Bar({ value, fill, className }: { value: number; fill: string; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded bg-muted', className)}>
      <div className={cx('h-full rounded', fill)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
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
              <span className="font-display text-lg leading-none font-extrabold">{parseISODate(d).getDate()}</span>
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
                <span className="w-11 font-display text-[13px] font-extrabold tabular-nums">{s.start}</span>
                {!pause && <Tile icon={st.icon} tone={st.tone} />}
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[15px]', pause ? 'font-semibold text-ink-3' : 'font-bold')}>{s.subject}</span>
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
