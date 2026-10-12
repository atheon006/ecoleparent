import { formatMoney, formatShort, PAYMENT_METHODS, todayISO, type Payment } from '@pe/shared';
import { deletePayment } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Button, Empty } from '@pe/shared/ui';
import { Download, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useRole } from '../access';
import { ConfirmAction, PageHeader, SearchBox, StatTile, Table, downloadCsv } from '../components/common';
import { ReceiptModal } from '../components/Receipt';
import { norm, useSchool } from '../school';

export function PaymentsPage() {
  const { db } = getFirebase();
  const role = useRole();
  const { payments, school, currency } = useSchool();
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [receipt, setReceipt] = useState<Payment | null>(null);

  const list = payments.filter(
    (p) =>
      p.date >= from &&
      p.date <= to &&
      (!method || p.method === method) &&
      (!search || norm(`${p.studentName} ${p.reference} ${p.feeName}`).includes(norm(search))),
  );
  const total = list.reduce((s, p) => s + p.amount, 0);
  const byMethod = PAYMENT_METHODS.map((m) => ({ m, sum: list.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0) })).filter((x) => x.sum > 0);

  return (
    <div>
      <PageHeader
        title="Paiements"
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} aria-hidden="true" />}
            onClick={() =>
              downloadCsv(`paiements_${from}_${to}.csv`, [
                ['Date', 'Référence', 'Élève', 'Classe', 'Frais', 'Montant', 'Mode', 'Caissier'],
                ...list.map((p) => [p.date, p.reference, p.studentName, p.className, p.feeName, p.amount, p.method, p.recordedByName]),
              ])
            }
          >
            Exporter (Excel)
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Du
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-xl border border-field bg-surface px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Au
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 rounded-xl border border-field bg-surface px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Mode
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-12 rounded-xl border border-field bg-surface px-3 font-normal">
            <option value="">Tous</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col justify-end">
          <SearchBox value={search} onChange={setSearch} placeholder="Élève ou référence" />
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total de la période" value={formatMoney(total, currency)} sub={`${list.length} paiement${list.length > 1 ? 's' : ''}`} />
        {byMethod.map((x) => (
          <StatTile key={x.m} label={x.m} value={formatMoney(x.sum, currency)} tone="info" />
        ))}
      </div>
      {list.length === 0 ? (
        <Empty icon={<Receipt size={22} />} title="Aucun paiement sur cette période" />
      ) : (
        <Table head={['Date', 'Élève', 'Frais', 'Montant', 'Mode', 'Référence', '']}>
          {list.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap">{formatShort(p.date)}</td>
              <td>
                <div className="font-semibold">{p.studentName}</div>
                <div className="text-xs text-ink-3">{p.className}</div>
              </td>
              <td>{p.feeName}</td>
              <td className="font-semibold whitespace-nowrap">{formatMoney(p.amount, currency)}</td>
              <td className="whitespace-nowrap">{p.method}</td>
              <td className="font-mono text-[13px] whitespace-nowrap">{p.reference}</td>
              <td className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => setReceipt(p)}>
                  Reçu
                </Button>
                {role === 'admin' && (
                  <ConfirmAction
                    label="Annuler"
                    title="Annuler ce paiement ?"
                    message={`Le paiement ${p.reference} de ${formatMoney(p.amount, currency)} sera supprimé. À utiliser seulement pour corriger une erreur de saisie.`}
                    confirmLabel="Supprimer le paiement"
                    onConfirm={() => deletePayment(db, p)}
                  />
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <ReceiptModal payment={receipt} school={school} onClose={() => setReceipt(null)} />
    </div>
  );
}
