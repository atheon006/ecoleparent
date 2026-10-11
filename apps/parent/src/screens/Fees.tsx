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

      <div className="pe-card mx-4 p-4">
        <div className="text-[12.5px] font-semibold text-ink-3">Reste à payer</div>
        <div className="flex items-end justify-between gap-3">
          <div className="font-display text-[40px] leading-[1.05] font-extrabold tabular-nums">{formatMoney(f.remaining, cur)}</div>
          <div className="text-right">
            <div className="font-display text-lg font-extrabold text-ok">{pct} %</div>
            <div className="text-xs text-ink-3">
              payé · {formatMoney(f.total - f.remaining, cur)} sur {formatMoney(f.total, cur)}
            </div>
          </div>
        </div>
        {f.fees.length > 0 && (
          <div className="mt-3.5 flex h-3 gap-0.5" aria-hidden="true">
            {f.fees.map((fs) => {
              const part = fs.fee.totalAmount ? Math.min(1, fs.paid / fs.fee.totalAmount) : 1;
              return (
                <span
                  key={fs.fee.id}
                  title={fs.fee.name}
                  className="rounded"
                  style={{
                    flex: fs.fee.totalAmount || 1,
                    background: part >= 1 ? 'var(--ok)' : part > 0 ? `linear-gradient(90deg, var(--ok) ${part * 100}%, var(--color-warn-soft) ${part * 100}%)` : 'var(--color-muted)',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {alert && (
        <div className={cx('pe-card mx-4 mt-3 flex items-center gap-3 p-4', alert.level === 'danger' && 'border-danger-line bg-danger-soft')}>
          <Tile icon={alert.level === 'danger' ? 'warning-circle' : 'hourglass'} tone={alert.level === 'danger' ? 'c' : 'a'} />
          <div className="min-w-0 flex-1">
            <div className={cx('font-extrabold', alert.level === 'danger' && 'text-danger-ink')}>{alertTitle(alert)}</div>
            <div className="text-[13px] text-ink-2">{alertText(alert, cur)}</div>
          </div>
        </div>
      )}

      {f.fees.length === 0 ? (
        <EmptyState icon="wallet" title="Aucun frais publié">
          L'école n'a pas encore publié la grille des frais pour la classe de {active.student.firstName}.
        </EmptyState>
      ) : (
        <>
          <Section title="Détail des frais" />
          <div className="flex flex-col gap-3">
            {f.fees.map((fs) => (
              <FeeCard key={fs.fee.id} fs={fs} currency={cur} />
            ))}
          </div>
        </>
      )}

      {active.payments.length > 0 && (
        <>
          <Section title="Paiements effectués" />
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
    <section className="pe-card mx-4 px-4 py-1.5">
      <div className="flex items-center justify-between pt-3 pb-2">
        <h2 className="font-display text-[17px] font-extrabold">{fs.fee.name}</h2>
        <span className="text-[15px] font-bold tabular-nums">{formatMoney(fs.fee.totalAmount, currency)}</span>
      </div>
      {fs.installments.length === 0 ? (
        <div className="flex items-center justify-between border-t border-line-soft py-3 text-sm">
          <span className="text-ink-3">Payé</span>
          <span className="font-bold">{formatMoney(fs.paid, currency)}</span>
        </div>
      ) : (
        <ol>
          {fs.installments.map((s) => (
            <InstallmentRow key={s.installment.id} s={s} currency={currency} />
          ))}
        </ol>
      )}
    </section>
  );
}

function InstallmentRow({ s, currency }: { s: InstallmentStatus; currency: string }) {
  const { installment: inst, state } = s;
  const urgent = state === 'renvoi' || state === 'overdue' || (state === 'upcoming' && s.daysToDue <= 10);
  const partial = state !== 'paid' && s.paidTowards > 0;
  return (
    <li className="flex gap-3 border-t border-line-soft py-3">
      {state === 'paid' ? (
        <span className="tone-g flex size-7 shrink-0 items-center justify-center rounded-full">
          <Icon name="check" size={16} label="Payée" />
        </span>
      ) : urgent ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-[3px] border-danger" aria-label="À payer, urgent">
          <span className="size-2.5 rounded-full bg-danger" />
        </span>
      ) : (
        <span className="size-7 shrink-0 rounded-full border-2 border-field" aria-label="À venir" />
      )}
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-[15px] font-bold">{inst.name}</span>
        {state === 'paid' ? (
          <span className="text-[13px] text-ink-3">Réglée</span>
        ) : (
          <>
            <span className="text-[13px] text-ink-3">
              Avant le {formatDayMonth(inst.dueDate)}
              {partial && ` · ${formatMoney(s.paidTowards, currency)} payés sur ${formatMoney(inst.amount, currency)}`}
            </span>
            {inst.cutoffDate && (
              <span className={cx('text-[13px]', urgent ? 'font-bold text-danger-ink' : 'text-ink-3')}>
                {state === 'renvoi'
                  ? `Renvoi depuis le ${formatDayMonth(inst.cutoffDate)} · manque ${formatMoney(s.missing, currency)}`
                  : `Renvoi le ${formatDayMonth(inst.cutoffDate)} si moins de ${formatMoney(s.required, currency)} payés`}
              </span>
            )}
          </>
        )}
      </div>
      <span className="text-[15px] font-bold tabular-nums">{formatMoney(inst.amount, currency)}</span>
    </li>
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
      <span className={cx('text-right font-bold', mono && 'font-mono')}>{value}</span>
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
          <div className="mt-2 font-extrabold">{school?.name}</div>
          {school?.address && <div className="text-xs text-ink-3">{school.address}</div>}
          <div className="mt-2.5 font-display text-[34px] font-extrabold tabular-nums">{formatMoney(p.amount, active.currency)}</div>
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
