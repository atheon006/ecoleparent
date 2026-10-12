import {
  PERIOD_BY_ID,
  formatLongCap,
  formatMoney,
  formatShort,
  formatTime,
  noSchoolReason,
  runningPercent,
  todayISO,
  type RsvpAnswer,
  type SchoolEvent,
} from '@pe/shared';
import { answerEvent, errorMessage } from '@pe/shared/api';
import { firstName, useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { cx, useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { ChildChips } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { Btn, DateBox, List, Pill, Row, Section, Tile, percentColor } from '../components/kit';
import { PushPrompt } from '../components/PushPrompt';
import { useParentData, type Child } from '../data';
import { accord, alertShort } from '../format';
import { agendaItems, currentPeriod, fmtNum, monthPresence, nameInitials, subjectStyle, yearGrades } from '../helpers';
import type { Nav } from '../nav';

export function Home({ nav }: { nav: Nav }) {
  const { user } = useAuth();
  const { active, children, setActiveId, unread } = useParentData();
  const today = todayISO();
  if (!active) return null;
  const others = children.filter((c) => c.id !== active.id && c.finance.alerts[0]?.level === 'danger');
  const name = firstName(user);

  return (
    <div>
      <header className="flex items-center gap-2 px-5 pt-safe-6 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-3">{formatLongCap(today)}</p>
          <h1 className="mt-0.5 text-2xl leading-tight font-semibold tracking-tight">Bonjour{name ? `, ${name}` : ''}</h1>
        </div>
        <button
          type="button"
          onClick={() => nav.push({ name: 'notifications' })}
          aria-label={unread ? `Nouveautés, ${unread} non lues` : 'Nouveautés'}
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-muted lg:hidden"
        >
          <Icon name="bell" size={22} />
          {unread > 0 && <span className="absolute top-2.5 right-3 size-2.5 rounded-full border-2 border-surface bg-danger" />}
        </button>
        <button type="button" onClick={() => nav.go('more')} aria-label="Mon compte et réglages" className="lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-ink-2">
            {nameInitials(user?.displayName || user?.email || 'P')}
          </span>
        </button>
      </header>

      <ChildChips nav={nav} />

      <div className="mt-5 flex flex-col gap-3 px-5">
        <PushPrompt />
        {others.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-danger-line px-3.5 py-2.5 text-left"
          >
            <span className="size-2 shrink-0 rounded-full bg-danger" />
            <span className="flex-1 text-sm">
              <strong className="font-semibold">{c.student.firstName}</strong> : {alertShort(c.finance.alerts[0], c.currency)}
            </span>
            <Icon name="caret-right" size={18} className="text-ink-4" />
          </button>
        ))}
        <Summary child={active} nav={nav} />
        <TodayRow child={active} today={today} nav={nav} />
      </div>

      <Todo child={active} nav={nav} today={today} />
      <LatestGrades child={active} nav={nav} />
      <NextEvent child={active} nav={nav} today={today} />
      <LastAnnouncement child={active} nav={nav} />
    </div>
  );
}

/** Synthèse de l'enfant : classe, école, moyenne, présence, reste à payer. */
function Summary({ child: c, nav }: { child: Child; nav: Nav }) {
  const period = currentPeriod(c);
  const pct = runningPercent(yearGrades(c), period);
  const presence = monthPresence(c);
  const f = c.finance;
  const school = c.school;
  const titulaire = c.classRoom?.titulaireName;
  const stat = (label: string, value: string, onClick: () => void, first?: boolean, alert?: boolean) => (
    <button type="button" onClick={onClick} className={cx('flex min-w-0 flex-col gap-0.5 text-left', !first && 'border-l border-line pl-3.5')}>
      <span className={cx('text-[22px] leading-tight font-semibold tracking-tight tabular-nums', alert && 'text-danger')}>{value}</span>
      <span className="text-xs leading-snug text-ink-3">{label}</span>
    </button>
  );
  return (
    <section className="pe-summary px-[18px] pt-[18px] pb-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold">
            {c.student.firstName} {c.student.lastName}
          </div>
          <div className="truncate text-[13px] text-ink-3">
            {c.student.className}
            {titulaire ? ` · titulaire ${titulaire}` : ''}
          </div>
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-surface text-xs font-bold text-brand"
          title={school?.name}
        >
          {school?.logo ? <img src={school.logo} alt="" className="size-full object-contain" /> : nameInitials(school?.name ?? 'École')}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 border-t border-line pt-3.5">
        {stat(`Moyenne · ${PERIOD_BY_ID[period].label}`, pct === null ? '—' : `${fmtNum(pct)} %`, () => nav.go('school', 'notes'), true)}
        {stat('Présence · ce mois', presence === null ? '—' : `${presence} %`, () => nav.go('school', 'presences'))}
        {stat('Reste à payer', formatMoney(f.remaining, c.currency), () => nav.go('fees'), false, f.alerts[0]?.level === 'danger')}
      </div>
    </section>
  );
}

/** Aujourd'hui : présence à l'appel, ou raison de l'absence de cours (jour férié, congé, week-end). */
function TodayRow({ child: c, today, nav }: { child: Child; today: string; nav: Nav }) {
  const s = c.student;
  const record = c.attendance.find((a) => a.date === today);
  const off = noSchoolReason(today, { events: c.events, saturdayClasses: c.school?.saturdayClasses });
  let dot: string;
  let title: string;
  let sub: string;
  if (record) {
    const by = `Appel de ${formatTime(record.recordedAt)} · ${record.recordedByName}`;
    switch (record.status) {
      case 'present':
        [dot, title, sub] = ['bg-ok', `${accord(s, 'Présent', 'Présente')} aujourd'hui`, by];
        break;
      case 'late':
        [dot, title, sub] = ['bg-warn', `${accord(s, 'Arrivé', 'Arrivée')} en retard`, record.reason || by];
        break;
      case 'absent':
        [dot, title, sub] = ['bg-danger', `${accord(s, 'Absent', 'Absente')} aujourd'hui`, 'Touchez pour justifier l’absence'];
        break;
      default:
        [dot, title, sub] = ['bg-info', 'Absence justifiée', by];
    }
  } else if (off) {
    [dot, title, sub] = ['bg-ink-4', 'Pas de cours aujourd’hui', off];
  } else {
    [dot, title, sub] = ['border-2 border-ink-4', "L'appel n'est pas encore fait", 'Vous serez prévenu dès que l’école l’aura fait'];
  }
  return (
    <button type="button" onClick={() => nav.go('school', 'presences')} className="flex w-full items-center gap-3 rounded-[14px] border border-line px-4 py-3.5 text-left">
      <span className={cx('size-2.5 shrink-0 rounded-full', dot)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block truncate text-[13px] text-ink-3">{sub}</span>
      </span>
      <Icon name="caret-right" size={18} className="text-ink-4" />
    </button>
  );
}

function Todo({ child: c, nav, today }: { child: Child; nav: Nav; today: string }) {
  const homework = c.homework.filter((h) => h.dueDate >= today && !c.seen.has(h.id));
  const alert = c.finance.alerts[0];
  const toSign = c.permissions.filter((p) => !c.permissionAnswers.has(p.id) && p.deadline >= today);
  const toConfirm = c.announcements.filter((a) => a.important && !c.acks.has(a.id));
  const toAnswer = c.events.filter((e) => e.rsvp && e.date >= today && !c.rsvps.has(e.id));
  const rows = [
    ...homework.slice(0, 2).map((h) => {
      const st = subjectStyle(h.subject);
      return (
        <Row
          key={h.id}
          left={<Tile icon={st.icon} tone={st.tone} />}
          title={h.title}
          sub={`${h.subject} · pour le ${formatShort(h.dueDate)}`}
          onClick={() => nav.go('school', 'devoirs')}
        />
      );
    }),
    alert && (
      <Row
        key="fee"
        left={<Tile icon="wallet" tone="a" />}
        title={`${alert.status.installment.name} : reste ${formatMoney(alert.status.missing, c.currency)}`}
        sub={`Avant le ${formatShort(alert.status.installment.dueDate)} · ${alert.fee.name}`}
        end={alert.level === 'danger' ? <Pill tone="bad">Urgent</Pill> : alert.status.daysToDue <= 7 ? <Pill tone="warn">J-{Math.max(0, alert.status.daysToDue)}</Pill> : undefined}
        onClick={() => nav.go('fees')}
      />
    ),
    ...toSign.map((p) => (
      <Row key={p.id} left={<Tile icon="signature" tone="t" />} title={p.title} sub={`À signer avant le ${formatShort(p.deadline)}`} end={<Pill tone="info">À signer</Pill>} onClick={() => nav.push({ name: 'permissions' })} />
    )),
    ...toConfirm.map((a) => (
      <Row key={a.id} left={<Tile icon="megaphone" />} title={a.title} sub="Communiqué important : confirmez la lecture" onClick={() => nav.go('news')} />
    )),
    ...toAnswer.map((e) => (
      <Row key={e.id} left={<Tile icon="handshake" tone="g" />} title={e.title} sub={`${formatShort(e.date)}${e.time ? ` à ${e.time}` : ''} · serez-vous là ?`} onClick={() => nav.push({ name: 'meetings' })} />
    )),
  ].filter(Boolean);

  return (
    <>
      <Section title="À faire" count={rows.length} />
      <List>{rows.length ? rows : <Row left={<Tile icon="check-circle" tone="g" />} title="Tout est à jour" sub="Rien à faire pour l'instant" />}</List>
    </>
  );
}

function LatestGrades({ child: c, nav }: { child: Child; nav: Nav }) {
  const latest = c.grades.filter((g) => g.score !== null).slice(0, 3);
  if (!latest.length) return null;
  return (
    <>
      <Section title="Dernières notes" action="Tout voir" onAction={() => nav.go('school', 'notes')} />
      <List>
        {latest.map((g) => {
          const st = subjectStyle(g.subjectName);
          const pct = ((g.score as number) / g.max) * 100;
          return (
            <Row
              key={g.id}
              left={<Tile icon={st.icon} tone={st.tone} />}
              title={g.subjectName}
              sub={`${g.title} · ${formatShort(g.date)}`}
              end={
                <span className={cx('text-base font-semibold tabular-nums', percentColor(pct))}>
                  {fmtNum(g.score as number)}/{fmtNum(g.max)}
                </span>
              }
              onClick={() => nav.go('school', 'notes')}
              chevron={false}
            />
          );
        })}
      </List>
    </>
  );
}

export function RsvpButtons({ child: c, event: e }: { child: Child; event: SchoolEvent }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<RsvpAnswer | null>(null);
  const answer = c.rsvps.get(e.id);
  async function send(a: RsvpAnswer) {
    setBusy(a);
    try {
      await answerEvent(getFirebase().db, c.student.schoolId, e.id, { uid: user!.uid, name: user!.displayName || user!.email || 'Parent' }, a);
      toast(a === 'yes' ? 'Merci, votre présence est notée.' : 'Votre absence est signalée.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }
  if (answer)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Pill tone={answer === 'yes' ? 'ok' : 'mute'} icon={answer === 'yes' ? 'check' : 'x'}>
          {answer === 'yes' ? 'Vous participez' : 'Absence signalée'}
        </Pill>
        <button type="button" onClick={() => void send(answer === 'yes' ? 'no' : 'yes')} className="text-[12.5px] font-semibold text-ink-3">
          Changer
        </button>
      </span>
    );
  return (
    <span className="flex flex-wrap gap-2">
      <Btn size="sm" onClick={() => void send('yes')} loading={busy === 'yes'}>
        Je participe
      </Btn>
      <Btn size="sm" variant="ghost" onClick={() => void send('no')} loading={busy === 'no'}>
        Je ne peux pas
      </Btn>
    </span>
  );
}

function NextEvent({ child: c, nav, today }: { child: Child; nav: Nav; today: string }) {
  const next = agendaItems(c, today, 90)[0];
  if (!next) return null;
  const e = next.kind === 'event' ? next.event : null;
  return (
    <>
      <Section title="Prochain événement" action="Agenda" onAction={() => nav.push({ name: 'agenda' })} />
      <div className="pe-card mx-4 flex items-center gap-3.5 p-4">
        <DateBox date={next.date} tone={next.kind === 'holiday' ? 'bad' : e?.category === 'Réunion' ? 'ok' : e?.category === 'Examen' ? 'info' : 'warn'} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{next.kind === 'event' ? next.event.title : next.name}</div>
          <div className="text-[13px] text-ink-3">
            {e ? [e.time, e.place, e.endDate && e.endDate !== e.date ? `jusqu'au ${formatShort(e.endDate)}` : null].filter(Boolean).join(' · ') || e.category : 'Jour férié · pas de cours'}
          </div>
          {e?.rsvp && (
            <div className="mt-2.5">
              <RsvpButtons child={c} event={e} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LastAnnouncement({ child: c, nav }: { child: Child; nav: Nav }) {
  const last = c.announcements[0];
  if (!last) return null;
  return (
    <>
      <Section title="Dernière annonce de l'école" action="Toutes" onAction={() => nav.go('news')} />
      <button type="button" onClick={() => nav.go('news')} className="pe-card mx-4 flex w-[calc(100%-2rem)] items-start gap-3 p-4 text-left">
        <Tile icon="megaphone" tone="a" />
        <span className="min-w-0">
          <span className="block font-semibold">{last.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-3">{last.content}</span>
        </span>
      </button>
    </>
  );
}
