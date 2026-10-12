import { computeStudentFinance, formatMoney, formatShort, PAYMENT_METHODS, todayISO, type Payment, type PaymentMethod, type Student } from '@pe/shared';
import { recordPayment } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Badge, Button, Card, ErrorNote, Field, SelectField, TextArea, cx } from '@pe/shared/ui';
import { Banknote } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useAccess } from '../access';
import { PageHeader, SearchBox, useAction } from '../components/common';
import { ReceiptModal } from '../components/Receipt';
import { fullName, matchStudent, useSchool } from '../school';

export function CashierPage() {
  const { students } = useSchool();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const results = search.trim().length >= 2 ? students.filter((s) => s.active && matchStudent(s, search)).slice(0, 8) : [];

  return (
    <div>
      <PageHeader title="Encaisser" description="Cherchez l'élève, choisissez le frais : le reste à payer s'affiche. Le parent voit le paiement aussitôt dans son application." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Nom de l'élève ou matricule" />
          <ul className="flex flex-col gap-2">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className={cx(
                    'flex w-full flex-col rounded-2xl border p-3 text-left',
                    selected?.id === s.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50',
                  )}
                >
                  <span className="font-semibold">{fullName(s)}</span>
                  <span className="text-[13px] text-ink-3">
                    {s.className} · {s.matricule}
                  </span>
                </button>
              </li>
            ))}
            {search.trim().length >= 2 && results.length === 0 && <li className="text-sm text-ink-3">Aucun élève trouvé.</li>}
          </ul>
        </div>
        {selected ? (
          <PaymentForm key={selected.id} student={students.find((s) => s.id === selected.id) ?? selected} onDone={() => setSearch('')} />
        ) : (
          <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center text-ink-3">
            <Banknote size={28} aria-hidden="true" />
            <span>Sélectionnez un élève pour enregistrer un paiement.</span>
          </Card>
        )}
      </div>
    </div>
  );
}

function PaymentForm({ student, onDone }: { student: Student; onDone: () => void }) {
  const { db } = getFirebase();
  const access = useAccess();
  const { school, fees, payments, currency } = useSchool();
  const { busy, run } = useAction();
  const finance = useMemo(() => computeStudentFinance(student, fees, payments, todayISO()), [student, fees, payments]);
  const firstDue = finance.fees.find((f) => f.next) ?? finance.fees[0];
  const [feeId, setFeeId] = useState(firstDue?.fee.id ?? '');
  const fs = finance.fees.find((f) => f.fee.id === feeId);
  const [amount, setAmount] = useState(() => String(firstDue?.next?.missing || firstDue?.remaining || ''));
  const [method, setMethod] = useState<PaymentMethod>('Espèces');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!fs) return setError('Choisissez un frais.');
    if (!(value > 0)) return setError('Montant invalide.');
    if (value > fs.remaining && fs.remaining > 0 && !window.confirm(`Le montant dépasse le reste à payer (${formatMoney(fs.remaining, currency)}). Continuer ?`)) return;
    const p = await run(
      () =>
        recordPayment(db, {
          student,
          feeId: fs.fee.id,
          feeName: fs.fee.name,
          amount: value,
          method,
          date,
          notes,
          recordedBy: access.email,
          recordedByName: access.name,
        }),
      'Paiement enregistré.',
    );
    if (p) {
      setReceipt(p);
      setNotes('');
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold">{fullName(student)}</span>
        <span className="text-sm text-ink-3">
          {student.className} · {student.matricule} · {student.parentName} ({student.parentPhone})
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">Payé {formatMoney(finance.paid, currency)}</Badge>
        <Badge tone={finance.remaining ? 'warn' : 'brand'}>Reste {formatMoney(finance.remaining, currency)}</Badge>
        {finance.alerts[0]?.level === 'danger' && <Badge tone="danger">Risque de renvoi</Badge>}
      </div>

      {finance.fees.length === 0 ? (
        <ErrorNote>Aucun frais ne s'applique à cet élève. Vérifiez la grille des frais et les options de sa fiche.</ErrorNote>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <SelectField
            label="Frais"
            value={feeId}
            onChange={(e) => {
              setFeeId(e.target.value);
              const next = finance.fees.find((f) => f.fee.id === e.target.value);
              setAmount(String(next?.next?.missing || next?.remaining || ''));
            }}
          >
            {finance.fees.map((f) => (
              <option key={f.fee.id} value={f.fee.id}>
                {f.fee.name} · reste {formatMoney(f.remaining, currency)}
              </option>
            ))}
          </SelectField>
          {fs?.next && (
            <p className="-mt-2 text-[13px] text-ink-2">
              {fs.next.installment.name} : {formatMoney(fs.next.missing, currency)} pour atteindre le seuil, avant le {formatShort(fs.next.installment.dueDate)}
              {fs.next.installment.cutoffDate && ` (renvoi le ${formatShort(fs.next.installment.cutoffDate)})`}.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`Montant (${currency})`} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <SelectField label="Mode" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </SelectField>
            <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} required />
          </div>
          <TextArea label="Note (facultatif)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. : référence de la transaction Mobile Money" />
          <Button type="submit" size="lg" loading={busy}>
            Enregistrer le paiement
          </Button>
        </form>
      )}

      <ReceiptModal
        payment={receipt}
        school={school}
        onClose={() => {
          setReceipt(null);
          onDone();
        }}
      />
    </Card>
  );
}
