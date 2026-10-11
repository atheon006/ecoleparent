import {
  PERIOD_BY_ID,
  formatLongCap,
  formatMoney,
  formatShort,
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
import { Avatar, ChildChips } from '../components/ChildPicker';
import { Icon, type IconName } from '../components/Icon';
import { Btn, CountBadge, DateBox, List, Pill, Row, Section, Tile, percentColor, type Tone } from '../components/kit';
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
      <header className="flex items-center gap-2.5 px-[18px] pt-safe-5 pb-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink-3">{formatLongCap(today)}</p>
          <h1 className="flex items-center gap-2 font-display text-[28px] leading-[1.05] font-extrabold tracking-tight">
            Bonjour{name ? `, ${name}` : ''}
            <Icon name="hand-waving" size={26} className="text-chalk" />
          </h1>
        </div>
        <button
          type="button"
          onClick={() => nav.push({ name: 'notifications' })}
          aria-label={unread ? `Nouveautés, ${unread} non lues` : 'Nouveautés'}
          className="relative flex size-[42px] shrink-0 items-center justify-center rounded-full border border-line bg-surface lg:hidden"
        >
          <Icon name="bell" size={22} />
          <CountBadge n={unread} className="absolute -top-1 -right-1" />
        </button>
        <button type="button" onClick={() => nav.go('more')} aria-label="Mon compte et réglages" className="lg:hidden">
          <span className="tone-a flex size-[42px] items-center justify-center rounded-full font-display text-[15px] font-extrabold">
            {nameInitials(user?.displayName || user?.email || 'P')}
          </span>
        </button>
      </header>

      <ChildChips nav={nav} />

      <div className="flex flex-col gap-3 px-4">
        <PushPrompt />
        {others.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-[14px] border border-danger-line bg-danger-soft px-3 py-2.5 text-left text-danger-text"
          >
            <span className="size-2 shrink-0 rounded-full bg-danger" />
            <span className="flex-1 text-sm">
              <strong>{c.student.firstName}</strong> : {alertShort(c.finance.alerts[0], c.currency)}
            </span>
            <Icon name="caret-right" size={18} />
          </button>
        ))}
        <Hero child={active} nav={nav} />
      </div>

      <TodayRow child={active} today={today} nav={nav} />
      <Todo child={active} nav={nav} today={today} />

      <Section title="Accès rapide" />
      <div className="pe-card mx-4 grid grid-cols-4 gap-x-1.5 gap-y-3.5 px-2.5 py-3.5">
        {(
          [
            ['Notes', 'chart-line-up', 'g', () => nav.go('school', 'notes')],
            ['Devoirs', 'notebook', 'v', () => nav.go('school', 'devoirs')],
            ['Présences', 'calendar-check', 't', () => nav.go('school', 'presences')],
            ['Horaire', 'clock', 'b', () => nav.go('school', 'horaire')],
            ['Bulletins', 'certificate', 'a', () => nav.push({ name: 'bulletins' })],
            ['Agenda', 'calendar-blank', 'c', () => nav.push({ name: 'agenda' })],
            ['Documents', 'folder-simple', 'b', () => nav.push({ name: 'documents' })],
            ['Conduite', 'star', 'a', () => nav.push({ name: 'conduct' })],
          ] as [string, IconName, Tone, () => void][]
        ).map(([label, icon, tone, onClick]) => (
          <button key={label} type="button" onClick={onClick} className="flex flex-col items-center gap-[7px] text-center text-[11.5px] font-semibold text-ink-2 active:scale-[.97]">
            <Tile icon={icon} tone={tone} size={52} />
            {label}
          </button>
        ))}
      </div>

      <LatestGrades child={active} nav={nav} />
      <NextEvent child={active} nav={nav} today={today} />
      <LastAnnouncement child={active} nav={nav} />
    </div>
  );
}

function Hero({ child: c, nav }: { child: Child; nav: Nav }) {
  const period = currentPeriod(c);
  const pct = runningPercent(yearGrades(c), period);
  const presence = monthPresence(c);
  const f = c.finance;
  const school = c.school;
  const titulaire = c.classRoom?.titulaireName;
  const stat = (label: string, value: string, sub: string, onClick: () => void, chalk?: boolean) => (
    <button type="button" onClick={onClick} className="min-w-0 rounded-2xl border border-white/15 bg-white/10 px-2.5 pt-2.5 pb-2 text-left">
      <span className="block text-[11px] font-semibold text-white/70">{label}</span>
      <span className={cx('block font-display text-[19px] leading-tight font-extrabold tabular-nums', chalk && 'text-[#f7d27a]')}>{value}</span>
      <span className="block truncate text-[10.5px] text-white/60">{sub}</span>
    </button>
  );
  return (
    <section className="pe-hero rounded-[26px] p-[18px]">
      <div className="flex items-center gap-3">
        <span className="rounded-full ring-2 ring-white/30">
          <Avatar child={c} size={56} />
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-xl leading-tight font-extrabold">
            {c.student.firstName} {c.student.lastName}
          </div>
          <div className="truncate text-[12.5px] text-white/75">
            {c.student.className}
            {titulaire ? ` · titulaire ${titulaire}` : ''}
          </div>
        </div>
        <span className="ml-auto flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white/10 font-display text-[13px] font-extrabold text-[#fcefc7]" title={school?.name}>
          {school?.logo ? <img src={school.logo} alt="" className="size-full bg-white object-contain" /> : nameInitials(school?.name ?? 'École')}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {stat('Moyenne', pct === null ? '—' : `${fmtNum(pct)} %`, PERIOD_BY_ID[period].label, () => nav.go('school', 'notes'))}
        {stat('Présence', presence === null ? '—' : `${presence} %`, 'ce mois-ci', () => nav.go('school', 'presences'))}
        {stat('Reste à payer', formatMoney(f.remaining, c.currency), `sur ${formatMoney(f.total, c.currency)}`, () => nav.go('fees'), true)}
      </div>
    </section>
  );
}

/** Aujourd'hui : présence à l'appel, ou raison de l'absence de cours (jour férié, congé, week-end). */
function TodayRow({ child: c, today, nav }: { child: Child; today: string; nav: Nav }) {
  const s = c.student;
  const record = c.attendance.find((a) => a.date === today);
  const off = noSchoolReason(today, { events: c.events, saturdayClasses: c.school?.saturdayClasses });
  let tile: [IconName, Tone];
  let title: string;
  let sub: string;
  if (record) {
    const by = `Appel fait par ${record.recordedByName}`;
    switch (record.status) {
      case 'present':
        [tile, title, sub] = [['check-circle', 'g'], `${s.firstName} est ${accord(s, 'présent', 'présente')} aujourd'hui`, by];
        break;
      case 'late':
        [tile, title, sub] = [['clock', 'a'], `${s.firstName} est ${accord(s, 'arrivé', 'arrivée')} en retard`, record.reason || by];
        break;
      case 'absent':
        [tile, title, sub] = [['warning-circle', 'c'], `${s.firstName} est ${accord(s, 'absent', 'absente')} aujourd'hui`, 'Touchez pour justifier l’absence'];
        break;
      default:
        [tile, title, sub] = [['first-aid-kit', 'b'], 'Absence justifiée', by];
    }
  } else if (off) {
    [tile, title, sub] = [['calendar-x', 'c'], 'Pas de cours aujourd’hui', off];
  } else {
    [tile, title, sub] = [['hourglass', 'a'], "L'appel n'est pas encore fait", 'Vous serez prévenu dès que l’école l’aura fait'];
  }
  return (
    <>
      <Section title="Aujourd'hui" />
      <List>
        <Row left={<Tile icon={tile[0]} tone={tile[1]} />} title={title} sub={sub} onClick={() => nav.go('school', 'presences')} />
      </List>
    </>
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
      <Row key={a.id} left={<Tile icon="megaphone" tone="c" />} title={a.title} sub="Communiqué important : confirmez la lecture" onClick={() => nav.go('news')} />
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
                <span className={cx('font-display text-base font-extrabold tabular-nums', percentColor(pct))}>
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
        <button type="button" onClick={() => void send(answer === 'yes' ? 'no' : 'yes')} className="text-[12.5px] font-bold text-ink-3">
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
          <div className="font-extrabold">{next.kind === 'event' ? next.event.title : next.name}</div>
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
          <span className="block font-extrabold">{last.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-3">{last.content}</span>
        </span>
      </button>
    </>
  );
}
