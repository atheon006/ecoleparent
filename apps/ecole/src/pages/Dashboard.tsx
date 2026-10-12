import {
  addDays,
  computeStudentFinance,
  formatLongCap,
  formatMoney,
  holidaysBetween,
  noSchoolReason,
  parseISODate,
  todayISO,
  type AppointmentSlot,
  type Attendance,
  type ParentRequest,
  type SchoolEvent,
} from '@pe/shared';
import { q } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { cx } from '@pe/shared/ui';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader } from '../components/common';
import { fullName, useSchool } from '../school';

/** Les `n` derniers jours de classe jusqu'à aujourd'hui (sans week-ends, fériés ni congés). */
function lastSchoolDays(today: string, n: number, events: SchoolEvent[], saturdayClasses?: boolean): string[] {
  const days: string[] = [];
  let d = today;
  for (let guard = 0; days.length < n && guard < 60; guard++) {
    if (!noSchoolReason(d, { events, saturdayClasses })) days.unshift(d);
    d = addDays(d, -1);
  }
  return days;
}

export function Dashboard() {
  const { db } = getFirebase();
  const { schoolId, school, students, classes, fees, payments, currency } = useSchool();
  const today = todayISO();
  const attendance = useLiveQuery<Attendance>(`att-day:${schoolId}:${today}`, () => q.schoolAttendanceOn(db, schoolId, today));
  const events = useLiveQuery<SchoolEvent>(`ev:${schoolId}`, () => q.events(db, schoolId));
  const requests = useLiveQuery<ParentRequest>(`req-pending:${schoolId}`, () => q.pendingRequests(db, schoolId));
  const justifications = useLiveQuery<Attendance>(`just:${schoolId}`, () => q.pendingJustifications(db, schoolId));
  const slots = useLiveQuery<AppointmentSlot>(`slots:${schoolId}`, () => q.slots(db, schoolId));
  const days = useMemo(() => lastSchoolDays(today, 10, events.data, school?.saturdayClasses), [today, events.data, school?.saturdayClasses]);
  const from = days[0] ?? today;
  const absences = useLiveQuery<Attendance>(`abs-since:${schoolId}:${from}`, () => q.schoolAbsencesSince(db, schoolId, from));
  const active = students.filter((s) => s.active);

  const month = today.slice(0, 7);
  const monthTotal = payments.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0);
  const todayTotal = payments.filter((p) => p.date === today).reduce((s, p) => s + p.amount, 0);

  const risk = useMemo(
    () => active.map((s) => ({ s, f: computeStudentFinance(s, fees, payments, today) })).filter((x) => x.f.alerts[0]?.level === 'danger'),
    [active, fees, payments, today],
  );

  const absent = attendance.data.filter((a) => a.status === 'absent');
  const late = attendance.data.filter((a) => a.status === 'late');
  const doneClasses = new Set(attendance.data.map((a) => a.classId));
  const presentRate = attendance.data.length ? Math.round(((attendance.data.length - absent.length) / attendance.data.length) * 1000) / 10 : null;
  const toConfirm = slots.data.filter((s) => s.status === 'requested' && s.date >= today).length;
  const nextHoliday = holidaysBetween(today, addDays(today, 120))[0];
  const tomorrowOff = noSchoolReason(addDays(today, 1), { events: events.data, saturdayClasses: school?.saturdayClasses });
  const todos = [
    { n: requests.data.length, label: 'Demandes de parents', href: '#/demandes' },
    { n: justifications.data.length, label: "Justifications d'absence", href: '#/justifications' },
    { n: toConfirm, label: 'Rendez-vous à confirmer', href: '#/rendez-vous' },
  ];

  return (
    <div>
      <PageHeader title="Tableau de bord" description={formatLongCap(today)} />

      <section aria-label="Chiffres clés" className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-line lg:grid-cols-4">
        <Kpi label="Élèves inscrits" value={String(active.length)} sub={`${classes.length} classe${classes.length > 1 ? 's' : ''}`} />
        <Kpi
          label="Présents aujourd'hui"
          value={presentRate === null ? '—' : `${new Intl.NumberFormat('fr-FR').format(presentRate)} %`}
          sub={`${absent.length} absent${absent.length > 1 ? 's' : ''} · ${late.length} retard${late.length > 1 ? 's' : ''}`}
        />
        <Kpi label="Encaissé ce mois" value={formatMoney(monthTotal, currency)} sub={`Aujourd'hui : ${formatMoney(todayTotal, currency)}`} />
        <Kpi label="Risque de renvoi" value={String(risk.length)} sub="élèves sous le seuil" alert={risk.length > 0} />
      </section>

      <div className="mt-5 flex flex-wrap gap-5">
        <section className="min-w-0 flex-[999_1_480px] rounded-[14px] border border-line px-5 pt-4 pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Élèves absents par jour</h2>
            <span className="text-[13px] text-ink-3">{days.length} derniers jours de classe</span>
          </div>
          <AbsenceChart days={days} absences={absences.data} today={today} />
          {tomorrowOff && <p className="mt-1 text-[13px] text-ink-3">Demain : {tomorrowOff}, pas de cours.</p>}
        </section>

        <section className="min-w-0 flex-[1_1_280px] rounded-[14px] border border-line pt-4 pb-1">
          <h2 className="mx-5 mb-1 text-base font-semibold">À traiter</h2>
          <ul className="pl-5">
            {todos.map((t) => (
              <li key={t.href} className="border-b border-line-soft last:border-0">
                <a href={t.href} className="flex min-h-12 items-center gap-3 pr-5 text-[15px] text-ink hover:text-brand">
                  <span className={cx('w-7 font-semibold tabular-nums', t.n === 0 && 'text-ink-4')}>{t.n}</span>
                  <span className="flex-1">{t.label}</span>
                  <ChevronRight size={17} className="text-ink-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          {nextHoliday && (
            <p className="mx-5 mt-1 mb-3 text-[13px] text-ink-3">
              Prochain jour férié : {formatLongCap(nextHoliday.date).toLowerCase()}, {nextHoliday.name}.
            </p>
          )}
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-[14px] border border-line pt-4 pb-1">
          <div className="mx-5 mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Appel du jour</h2>
            <a href="#/appel" className="text-sm font-semibold text-brand">
              Faire l'appel
            </a>
          </div>
          <ul className="pl-5">
            {classes.map((c) => {
              const recs = attendance.data.filter((a) => a.classId === c.id);
              const abs = recs.filter((a) => a.status === 'absent').length;
              const lat = recs.filter((a) => a.status === 'late').length;
              return (
                <li key={c.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-line-soft pr-5 last:border-0">
                  <span className="text-[15px] font-medium">{c.name}</span>
                  {recs.length === 0 ? (
                    <span className="text-sm font-semibold text-warn">Pas encore fait</span>
                  ) : (
                    <span className="text-sm text-ink-3">
                      {abs ? <strong className="font-semibold text-danger">{abs} absent{abs > 1 ? 's' : ''}</strong> : 'Tous présents'}
                      {lat ? ` · ${lat} retard${lat > 1 ? 's' : ''}` : ''}
                    </span>
                  )}
                </li>
              );
            })}
            {classes.length === 0 && <li className="py-3 text-sm text-ink-3">Créez d'abord vos classes.</li>}
          </ul>
          <p className="mx-5 mt-1 mb-3 text-[13px] text-ink-3">
            Appel fait dans {doneClasses.size} classe{doneClasses.size > 1 ? 's' : ''} sur {classes.length}.
          </p>
        </section>

        <section className="rounded-[14px] border border-line pt-4 pb-1">
          <div className="mx-5 mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Élèves à risque de renvoi</h2>
            <a href="#/recouvrement" className="text-sm font-semibold text-brand">
              Tout voir
            </a>
          </div>
          <ul className="pl-5">
            {risk.slice(0, 8).map(({ s, f }) => (
              <li key={s.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-line-soft py-1.5 pr-5 last:border-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium">{fullName(s)}</span>
                  <span className="text-[13px] text-ink-3">
                    {s.className} · {f.alerts[0].fee.name}
                  </span>
                </span>
                <span className="text-[15px] font-semibold text-danger tabular-nums">{formatMoney(f.alerts[0].status.missing, currency)}</span>
              </li>
            ))}
            {risk.length === 0 && <li className="py-3 pr-5 text-sm text-ink-3">Aucun élève en situation de renvoi pour le moment.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className="border-line px-5 py-4 [&:not(:last-child)]:border-r max-lg:[&:nth-child(2)]:border-r-0 max-lg:[&:nth-child(-n+2)]:border-b">
      <div className="text-[13px] text-ink-3">{label}</div>
      <div className={cx('text-[28px] leading-tight font-semibold tracking-tight tabular-nums', alert && 'text-danger')}>{value}</div>
      <div className="text-[13px] text-ink-3">{sub}</div>
    </div>
  );
}

/** Barres : élèves absents par jour de classe (une seule série, couleur validée pour les graphiques). */
function AbsenceChart({ days, absences, today }: { days: string[]; absences: Attendance[]; today: string }) {
  const counts = days.map((d) => absences.filter((a) => a.date === d).length);
  const max = Math.max(4, ...counts);
  const step = max <= 10 ? 2 : max <= 25 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const W = 640;
  const H = 220;
  const left = 34;
  const base = 186;
  const height = 160;
  const slot = (W - left - 6) / Math.max(1, days.length);
  const bar = Math.min(40, slot * 0.6);
  const y = (v: number) => base - (v / top) * height;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const maxIdx = counts.indexOf(Math.max(...counts));
  const label = (d: string) => (d === today ? 'Auj.' : `${parseISODate(d).getDate()}/${parseISODate(d).getMonth() + 1}`);
  const summary = days.map((d, i) => `${label(d)} : ${counts[i]}`).join(', ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Élèves absents par jour. ${summary}.`} className="mt-3 block h-auto w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 4} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#d5d9d4' : '#eef0ec'} />
          <text x={left - 8} y={y(t) + 4} fontSize="11" fill="#6b746f" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = left + i * slot + (slot - bar) / 2;
        const h = base - y(counts[i]);
        return (
          <g key={d}>
            <title>{`${formatLongCap(d)} : ${counts[i]} absent${counts[i] > 1 ? 's' : ''}`}</title>
            {/* Zone de survol plus grande que la barre. */}
            <rect x={left + i * slot} y={base - height} width={slot} height={height} fill="transparent" />
            {h > 0 && <path d={`M${x},${base} v${-(h - 4)} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${h - 4} z`} fill="#2e8b5e" />}
            <text x={x + bar / 2} y={base + 18} fontSize="11" fill={d === today ? '#3d4641' : '#6b746f'} fontWeight={d === today ? 600 : 400} textAnchor="middle">
              {label(d)}
            </text>
            {i === maxIdx && counts[i] > 0 && (
              <text x={x + bar / 2} y={y(counts[i]) - 6} fontSize="12" fontWeight="600" fill="#3d4641" textAnchor="middle">
                {counts[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
