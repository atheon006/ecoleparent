import { formatFull, formatMoney, type Payment, type School } from '@pe/shared';
import { Button, Modal } from '@pe/shared/ui';
import { Printer } from 'lucide-react';

/** Reçu imprimable (format ticket ou A4). */
export function ReceiptModal({ payment, school, onClose }: { payment: Payment | null; school: School | null; onClose: () => void }) {
  if (!payment) return null;
  const cur = school?.currency ?? '$';
  return (
    <Modal
      open
      onClose={onClose}
      title="Reçu de paiement"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
            Imprimer
          </Button>
        </>
      }
    >
      <div className="print-area mx-auto flex max-w-sm flex-col gap-3 rounded-2xl border border-line p-5 text-[14px]">
        <div className="flex flex-col items-center gap-0.5 border-b border-dashed border-line pb-3 text-center">
          <span className="text-base font-semibold">{school?.name}</span>
          {school?.address && <span className="text-xs text-ink-3">{school.address}</span>}
          {school?.phone && <span className="text-xs text-ink-3">{school.phone}</span>}
        </div>
        <div className="text-center">
          <div className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Reçu</div>
          <div className="font-mono text-base font-semibold">{payment.reference}</div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-ink-3">Élève</dt>
          <dd className="text-right font-semibold">{payment.studentName}</dd>
          <dt className="text-ink-3">Classe</dt>
          <dd className="text-right">{payment.className}</dd>
          <dt className="text-ink-3">Motif</dt>
          <dd className="text-right">{payment.feeName}</dd>
          <dt className="text-ink-3">Mode</dt>
          <dd className="text-right">{payment.method}</dd>
          <dt className="text-ink-3">Date</dt>
          <dd className="text-right">{formatFull(payment.date)}</dd>
          <dt className="text-ink-3">Caissier</dt>
          <dd className="text-right">{payment.recordedByName}</dd>
        </dl>
        <div className="flex items-baseline justify-between border-t border-dashed border-line pt-3">
          <span className="font-semibold">Montant</span>
          <span className="font-display text-2xl font-semibold">{formatMoney(payment.amount, cur)}</span>
        </div>
        {payment.notes && <p className="text-xs text-ink-3">{payment.notes}</p>}
        <p className="text-center text-xs text-ink-3">Ce paiement apparaît aussi dans l'application ParentEcole du parent.</p>
      </div>
    </Modal>
  );
}
