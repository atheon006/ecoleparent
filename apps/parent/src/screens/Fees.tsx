import { formatDayMonth, formatFull, formatMoney, formatShort, type FeeStatus, type InstallmentStatus, type Payment } from '@pe/shared';
import { cx, useToast } from '@pe/shared/ui';
import { RootHeader, SubHeader } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { Btn, EmptyState, List, Note, Row, Section, Tile } from '../components/kit';
import { useParentData, type Child } from '../data';
import { alertText, alertTitle } from '../format';
import { yearOf } from '../helpers';
import { isNative, shareText } from '../native';
import type { Nav } from '../nav';

export function FeesScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  if (!active) return null;
  const f = active.finance;
  const alert = f.alerts[0];
  const cur = active.currency;
  const pct = f.total ? Math.round(((f.total - f.remaining) / f.total) * 100) : 0;

  return (
    <div>
      <RootHeader title="Frais scolaires" subtitle={`${active.student.firstName} · année ${yearOf(active)}`} nav={nav} />

      <section className="px-5 pt-2">
        <div className="text-[13px] text-ink-3">Reste à payer · année {yearOf(active)}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[40px] leading-[1.1] font-semibold tracking-tight tabular-nums">{formatMoney(f.remaining, cur)}</span>
          <span className="text-sm text-ink-3">sur {formatMoney(f.total, cur)}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-[13px] text-ink-3">
          {formatMoney(f.total - f.remaining, cur)} payés ({pct} %)
        </div>
      </section>

      {alert && (
        <div className={cx('mx-5 mt-[18px] flex gap-3 rounded-[14px] border px-4 py-3.5', alert.level === 'danger' ? 'border-danger-line bg-danger-soft' : 'border-[#f1d7a8] bg-warn-soft')}>
          <Icon name="warning-circle" size={20} className={cx('mt-0.5', alert.level === 'danger' ? 'text-danger' : 'text-warn')} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{alertTitle(alert)}</div>
            <div className="text-[13px] text-ink-2">{alertText(alert, cur)}</div>
          </div>
        </div>
      )}

      {f.fees.length === 0 ? (
        <EmptyState icon="wallet" title="Aucun frais publié">
          L'école n'a pas encore publié la grille des frais pour la classe de {active.student.firstName}.
        </EmptyState>
      ) : (
        f.fees.map((fs) => <FeeCard key={fs.fee.id} fs={fs} currency={cur} />)
      )}

      {active.payments.length > 0 && (
        <>
          <Section title="Paiements" />
          <List>
            {active.payments.map((p) => (
              <Row
                key={p.id}
                left={<Tile icon="receipt" tone="b" />}
                title={`${formatMoney(p.amount, cur)} · ${p.feeName}`}
                sub={`${formatShort(p.date)} · reçu ${p.reference}`}
                onClick={() => nav.push({ name: 'receipt', id: p.id })}
              />
            ))}
          </List>
          {f.unallocated > 0 && (
            <Note icon="info">
              {formatMoney(f.unallocated, cur)} payés pour des frais qui ne s'appliquent plus à cet élève. Renseignez-vous à la caisse.
            </Note>
          )}
        </>
      )}

      <Note icon="buildings">
        Les paiements se font à la caisse de l'école{active.school?.address ? `, ${active.school.address}` : ''}. Votre reçu arrive ici automatiquement.
      </Note>
    </div>
  );
}

function FeeCard({ fs, currency }: { fs: FeeStatus; currency: string }) {
  return (
    <section>
      <h2 className="mx-5 mt-7 mb-1 text-[17px] font-semibold">
        {fs.fee.name} <span className="font-medium text-ink-4">{formatMoney(fs.fee.totalAmount, currency)}</span>
      </h2>
      {fs.installments.length === 0 ? (
        <List>
          <Row
            left={<Icon name={fs.paid >= fs.fee.totalAmount ? 'check-circle' : 'clock'} size={20} className={fs.paid >= fs.fee.totalAmount ? 'text-ok' : 'text-warn'} />}
            title={fs.paid >= fs.fee.totalAmount ? 'Réglé' : `${formatMoney(fs.paid, currency)} payés`}
            end={<span className="text-ink-2 tabular-nums">{formatMoney(fs.fee.totalAmount, currency)}</span>}
          />
        </List>
      ) : (
        <List>
          {fs.installments.map((s) => (
            <InstallmentRow key={s.installment.id} s={s} currency={currency} />
          ))}
        </List>
      )}
    </section>
  );
}

function InstallmentRow({ s, currency }: { s: InstallmentStatus; currency: string }) {
  const { installment: inst, state } = s;
  const urgent = state === 'renvoi' || state === 'overdue' || (state === 'upcoming' && s.daysToDue <= 10);
  const partial = state !== 'paid' && s.paidTowards > 0;
  const sub =
    state === 'paid'
      ? 'Réglée'
      : [partial ? `${formatMoney(s.paidTowards, currency)} payés` : null, `avant le ${formatDayMonth(inst.dueDate)}`].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3.5 py-3 pr-5">
      <Icon
        name={state === 'paid' ? 'check-circle' : urgent ? 'warning-circle' : 'clock'}
        size={20}
        className={state === 'paid' ? 'text-ok' : urgent ? 'text-danger' : 'text-ink-4'}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{inst.name}</span>
        <span className="block text-[13px] text-ink-3">{sub.charAt(0).toUpperCase() + sub.slice(1)}</span>
        {state !== 'paid' && inst.cutoffDate && urgent && (
          <span className="block text-[13px] font-medium text-danger">
            {state === 'renvoi'
              ? `Renvoi depuis le ${formatDayMonth(inst.cutoffDate)} · manque ${formatMoney(s.missing, currency)}`
              : `Renvoi le ${formatDayMonth(inst.cutoffDate)} sous ${formatMoney(s.required, currency)} payés`}
          </span>
        )}
      </span>
      <span className="text-ink-2 tabular-nums">{formatMoney(inst.amount, currency)}</span>
    </div>
  );
}

export function receiptText(child: Child, p: Payment): string {
  return [
    `Reçu de paiement — ${child.school?.name ?? 'École'}`,
    `Élève : ${p.studentName} (${p.className})`,
    `Code élève : ${child.student.matricule}`,
    `${p.feeName} : ${formatMoney(p.amount, child.currency)}`,
    `Date : ${formatShort(p.date)} · ${p.method}`,
    `Référence : ${p.reference}`,
    `Encaissé par : ${p.recordedByName}`,
  ].join('\n');
}

export function ReceiptScreen({ nav, id }: { nav: Nav; id: string }) {
  const { active } = useParentData();
  const toast = useToast();
  const p = active?.payments.find((x) => x.id === id);
  if (!active || !p) {
    return (
      <div>
        <SubHeader title="Reçu" onBack={nav.back} />
        <EmptyState icon="receipt" title="Reçu introuvable" />
      </div>
    );
  }
  async function share() {
    try {
      if ((await shareText(`Reçu ${p!.reference}`, receiptText(active!, p!))) === 'copied') toast('Reçu copié.');
    } catch {
      /* partage annulé */
    }
  }
  const school = active.school;
  const line = (label: string, value: string, mono?: boolean) => (
    <div className="flex justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className={cx('text-right font-semibold', mono && 'font-mono')}>{value}</span>
    </div>
  );
  return (
    <div>
      <SubHeader title={`Reçu ${p.reference}`} onBack={nav.back} />
      <div className="print-area pe-card mx-4 overflow-hidden">
        <div className="border-b-2 border-dashed border-line p-[18px] text-center">
          <span className="inline-flex">
            {school?.logo ? <img src={school.logo} alt="" className="size-12 rounded-xl object-contain" /> : <Tile icon="seal-check" tone="g" />}
          </span>
          <div className="mt-2 font-semibold">{school?.name}</div>
          {school?.address && <div className="text-xs text-ink-3">{school.address}</div>}
          <div className="mt-2.5 text-[34px] font-semibold tabular-nums">{formatMoney(p.amount, active.currency)}</div>
          <div className="text-[12.5px] text-ink-3">{p.feeName}</div>
        </div>
        <div className="grid gap-2 px-[18px] pt-3.5 pb-[18px] text-[13.5px]">
          {line('Élève', p.studentName)}
          {line('Classe', p.className)}
          {line('Date', formatFull(p.date))}
          {line('Mode de paiement', p.method)}
          {line('Encaissé par', p.recordedByName)}
          {line('Référence', p.reference, true)}
        </div>
      </div>
      <div className="mx-4 mt-3.5 grid grid-cols-2 gap-2.5">
        {!isNative && (
          <Btn variant="ghost" icon="download-simple" onClick={() => window.print()}>
            Imprimer
          </Btn>
        )}
        <Btn icon="share-network" onClick={() => void share()} className={isNative ? 'col-span-2' : undefined}>
          Partager
        </Btn>
      </div>
      <Note icon="shield-check">La référence du reçu permet à l'école de retrouver ce paiement dans sa caisse.</Note>
    </div>
  );
}
