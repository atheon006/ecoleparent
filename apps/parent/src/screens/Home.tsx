import { formatLongCap, formatMoney, formatShort, formatTime, formatWeekdayShort, parseISODate, todayISO } from '@pe/shared';
import { useAuth, firstName } from '@pe/shared/auth';
import { Card, Progress, cx } from '@pe/shared/ui';
import { Award, Bell, CalendarDays, Check, ChevronRight, Clock, Megaphone, TriangleAlert, UserRound, X } from 'lucide-react';
import type { Nav } from '../App';
import { ChildChips, SectionTitle } from '../components/ChildPicker';
import { useParentData, type Child } from '../data';
import { accord, alertShort, alertText, alertTitle } from '../format';

export function Home({ nav }: { nav: Nav }) {
  const { user } = useAuth();
  const { active, children, setActiveId, unread } = useParentData();
  const today = todayISO();
  if (!active) return null;
  const others = children.filter((c) => c.id !== active.id && c.finance.alerts[0]?.level === 'danger');

  return (
    <div className="pb-6">
      <header className="flex items-center justify-between gap-3 px-5 pt-safe-5 pb-2">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-ink-3">{formatLongCap(today)}</span>
          <span className="font-display text-[26px] font-bold">Bonjour{firstName(user) ? `, ${firstName(user)}` : ''}</span>
        </div>
        <div className="flex gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => nav.open('account')}
          aria-label="Mon compte"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface"
        >
          <UserRound size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => nav.open('notifications')}
          aria-label={unread ? `Nouveautés, ${unread} non lues` : 'Nouveautés'}
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface"
        >
          <Bell size={22} aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ground bg-danger px-1 text-[11px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        </div>
      </header>

      <ChildChips nav={nav} />

      <div className="flex flex-col gap-4 px-5">
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
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}

        <TodayCard child={active} today={today} />
        <FinanceCard child={active} nav={nav} />
        <HomeworkPreview child={active} nav={nav} today={today} />
        <ConductPreview child={active} nav={nav} />
        <AnnouncementPreview child={active} nav={nav} />
      </div>
    </div>
  );
}

function TodayCard({ child, today }: { child: Child; today: string }) {
  const s = child.student;
  const record = child.attendance.find((a) => a.date === today);
  const weekday = parseISODate(today).getDay();
  const weekend = weekday === 0 || weekday === 6;

  let icon = <Clock size={26} strokeWidth={2.2} aria-hidden="true" />;
  let iconClass = 'bg-brand-2 text-brand-ink';
  let title: string;
  let detail: string;

  if (record) {
    detail = `Appel de ${formatTime(record.recordedAt)} · ${record.recordedByName}`;
    switch (record.status) {
      case 'present':
        icon = <Check size={26} strokeWidth={2.6} aria-hidden="true" />;
        iconClass = 'bg-chalk text-ink';
        title = `${s.firstName} est ${accord(s, 'présent', 'présente')}`;
        break;
      case 'late':
        iconClass = 'bg-chalk text-ink';
        title = `${s.firstName} est ${accord(s, 'arrivé', 'arrivée')} en retard`;
        if (record.reason) detail = `${record.reason} · ${record.recordedByName}`;
        break;
      case 'absent':
        icon = <X size={26} strokeWidth={2.6} aria-hidden="true" />;
        iconClass = 'bg-danger text-white';
        title = `${s.firstName} est ${accord(s, 'absent', 'absente')}`;
        break;
      case 'excused':
        icon = <Check size={26} strokeWidth={2.6} aria-hidden="true" />;
        title = 'Absence justifiée';
        break;
    }
  } else if (weekend) {
    title = "Pas d'école aujourd'hui";
    detail = 'Bon week-end !';
  } else {
    title = "L'appel n'est pas encore fait";
    detail = 'Vous verrez ici la présence dès que le surveillant aura fait l’appel.';
  }

  return (
    <section className="flex items-center gap-3.5 rounded-[22px] bg-brand p-[18px] text-white">
      <div className={cx('flex size-[52px] shrink-0 items-center justify-center rounded-2xl', iconClass)}>{icon}</div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-brand-ink">Aujourd'hui à l'école</span>
        <span className="font-display text-[21px] leading-tight font-bold">{title}</span>
        <span className="text-[13px] text-brand-ink">{detail}</span>
      </div>
    </section>
  );
}

function FinanceCard({ child, nav }: { child: Child; nav: Nav }) {
  const f = child.finance;
  const alert = f.alerts[0];
  if (alert?.level === 'danger') {
    return (
      <section className="flex flex-col gap-2.5 rounded-[22px] border border-danger-line bg-danger-soft p-4">
        <div className="flex items-center gap-2.5 text-danger-ink">
          <TriangleAlert size={22} aria-hidden="true" />
          <h2 className="font-display text-lg leading-tight font-bold">{alertTitle(alert)}</h2>
        </div>
        <p className="text-sm leading-relaxed text-danger-text">{alertText(alert, child.currency)}</p>
        <button type="button" onClick={() => nav.go('fees')} className="flex min-h-[46px] items-center self-start rounded-xl bg-danger px-[18px] text-sm font-bold text-white">
          Voir les frais
        </button>
      </section>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-4">
      <SectionTitle
        action={
          <button type="button" onClick={() => nav.go('fees')} className="min-h-11 text-sm font-semibold text-brand">
            Détails
          </button>
        }
      >
        Frais scolaires
      </SectionTitle>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[30px] font-extrabold">{formatMoney(f.paid, child.currency)}</span>
        <span className="text-sm text-ink-3">payés sur {formatMoney(f.total, child.currency)}</span>
      </div>
      <Progress value={f.total ? f.paid / f.total : 0} />
      <div className="flex items-center gap-3 rounded-[14px] bg-ground p-3">
        <CalendarDays size={22} className="shrink-0 text-brand" aria-hidden="true" />
        {alert ? (
          <div className="flex flex-col">
            <span className="text-sm font-bold">
              {alert.status.installment.name} ({alert.fee.name.toLowerCase()}) : {formatMoney(alert.status.missing, child.currency)}
            </span>
            <span className="text-[13px] text-ink-3">À payer avant le {formatShort(alert.status.installment.dueDate)}</span>
          </div>
        ) : (
          <span className="text-sm font-bold">{f.total ? 'Toutes les échéances sont réglées.' : "Aucun frais publié par l'école pour l'instant."}</span>
        )}
      </div>
    </Card>
  );
}

function HomeworkPreview({ child, nav, today }: { child: Child; nav: Nav; today: string }) {
  const upcoming = child.homework.filter((h) => h.dueDate >= today).slice(0, 2);
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        action={
          <button type="button" onClick={() => nav.go('homework')} className="min-h-11 text-sm font-semibold text-brand">
            Tout voir
          </button>
        }
      >
        Devoirs à rendre
      </SectionTitle>
      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink-3">Aucun devoir à rendre pour le moment.</p>
      ) : (
        upcoming.map((h, i) => (
          <button
            key={h.id}
            type="button"
            onClick={() => nav.go('homework')}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
          >
            <span className={cx('flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-xl', i === 0 ? 'bg-info-soft text-info' : 'bg-ground text-ink')}>
              <span className="text-[11px] font-bold uppercase">{formatWeekdayShort(h.dueDate)}</span>
              <span className="font-display text-xl leading-none font-extrabold">{parseISODate(h.dueDate).getDate()}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs font-bold tracking-wide text-info uppercase">{h.subject}</span>
              <span className="truncate text-[15px] font-semibold">{h.title}</span>
              {h.description && <span className="truncate text-[13px] text-ink-3">{h.description}</span>}
            </span>
            {child.seen.has(h.id) && <Check size={18} className="shrink-0 text-brand" aria-label="Vu" />}
          </button>
        ))
      )}
    </section>
  );
}

function ConductPreview({ child, nav }: { child: Child; nav: Nav }) {
  const last = child.conduct[0];
  if (!last) return null;
  const positive = last.severity === 'positive';
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        action={
          <button type="button" onClick={() => nav.go('school')} className="min-h-11 text-sm font-semibold text-brand">
            Historique
          </button>
        }
      >
        Conduite
      </SectionTitle>
      <Card className="flex gap-3 p-3.5" as="div">
        <span
          className={cx(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            positive ? 'bg-brand-soft text-brand' : last.severity === 'danger' ? 'bg-danger-soft text-danger-ink' : 'bg-warn-soft text-warn',
          )}
        >
          {positive ? <Award size={20} aria-hidden="true" /> : <TriangleAlert size={20} aria-hidden="true" />}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className={cx('text-xs font-bold tracking-wide uppercase', positive ? 'text-brand' : 'text-warn')}>{last.type}</span>
          <span className="text-[15px] font-semibold">{last.title}</span>
          <span className="text-[13px] text-ink-3">
            {last.author} · {formatShort(last.date)}
          </span>
        </div>
      </Card>
    </section>
  );
}

function AnnouncementPreview({ child, nav }: { child: Child; nav: Nav }) {
  const last = child.announcements[0];
  if (!last) return null;
  return (
    <button type="button" onClick={() => nav.go('school')} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
        <Megaphone size={20} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-bold tracking-wide text-warn uppercase">Dernier communiqué · {last.category}</span>
        <span className="text-[15px] font-semibold">{last.title}</span>
        <span className="line-clamp-2 text-[13px] text-ink-3">{last.content}</span>
      </span>
    </button>
  );
}
