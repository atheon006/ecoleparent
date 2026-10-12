import { FEE_TYPE_LABELS, cumulativeThresholds, formatMoney, formatShort, shortId, sortInstallments, type FeeCategory, type FeeInstallment, type FeeType } from '@pe/shared';
import { deleteFee, saveFee } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Badge, Button, Card, Checkbox, Empty, ErrorNote, Field, IconButton, Modal, SelectField } from '@pe/shared/ui';
import { Pencil, Plus, Trash, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmAction, PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

export function FeesPage() {
  const { db } = getFirebase();
  const { schoolId, fees, classById, currency } = useSchool();
  const [editing, setEditing] = useState<FeeCategory | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title="Frais scolaires"
        description="Pour chaque tranche : la date limite de paiement, et la date de renvoi à laquelle l'élève doit avoir payé un montant cumulé minimum. Les parents voient tout cela dans l'application."
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')}>
            Nouveau frais
          </Button>
        }
      />
      {fees.length === 0 ? (
        <Empty icon={<Wallet size={22} />} title="Aucun frais" action={<Button onClick={() => setEditing('new')}>Créer le minerval</Button>}>
          Commencez par le minerval, découpé en tranches.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {fees.map((fee) => {
            const insts = sortInstallments(fee.installments);
            const thresholds = cumulativeThresholds(insts);
            return (
              <Card key={fee.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-semibold">{fee.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="info">{FEE_TYPE_LABELS[fee.type]}</Badge>
                      <Badge tone="neutral">{fee.classIds.length ? fee.classIds.map((id) => classById.get(id)?.name ?? '?').join(', ') : 'Toutes les classes'}</Badge>
                    </div>
                  </div>
                  <span className="font-display text-xl font-semibold">{formatMoney(fee.totalAmount, currency)}</span>
                </div>
                {insts.length > 0 && (
                  <ol className="flex flex-col divide-y divide-line-soft text-sm">
                    {insts.map((i, idx) => (
                      <li key={i.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-2">
                        <span className="font-semibold">
                          {i.name} · {formatMoney(i.amount, currency)}
                        </span>
                        <span className="text-ink-3">
                          avant le {formatShort(i.dueDate)} · renvoi le {formatShort(i.cutoffDate)} sous {formatMoney(thresholds[idx], currency)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditing(fee)}>
                    Modifier
                  </Button>
                  <ConfirmAction
                    label="Supprimer"
                    title="Supprimer ce frais ?"
                    message="Les paiements déjà enregistrés pour ce frais restent dans l'historique, mais ne seront plus rattachés à un frais."
                    onConfirm={() => deleteFee(db, schoolId, fee.id)}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <FeeEditor fee={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const emptyInstallment = (n: number): FeeInstallment => ({
  id: shortId('t'),
  name: n === 1 ? '1re tranche' : `${n}e tranche`,
  amount: 0,
  dueDate: '',
  cutoffDate: '',
  minimumCumulative: 0,
});

function FeeEditor({ fee, onClose }: { fee: FeeCategory | null; onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId, classes, currency } = useSchool();
  const { busy, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(fee?.name ?? 'Minerval');
  const [type, setType] = useState<FeeType>(fee?.type ?? 'tuition');
  const [classIds, setClassIds] = useState<string[]>(fee?.classIds ?? []);
  const [insts, setInsts] = useState<FeeInstallment[]>(fee ? sortInstallments(fee.installments) : [emptyInstallment(1)]);
  const [flatAmount, setFlatAmount] = useState(fee && fee.installments.length === 0 ? String(fee.totalAmount) : '');
  const total = insts.reduce((s, i) => s + (i.amount || 0), 0);
  const auto = cumulativeThresholds(insts.map((i) => ({ ...i, minimumCumulative: 0 })));

  const patch = (idx: number, p: Partial<FeeInstallment>) => setInsts((xs) => xs.map((x, i) => (i === idx ? { ...x, ...p } : x)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    for (const i of insts) {
      if (!(i.amount > 0) || !i.dueDate) return setError('Chaque tranche doit avoir un montant et une date limite.');
      if (i.cutoffDate && i.cutoffDate < i.dueDate) return setError(`${i.name} : la date de renvoi doit être après la date limite.`);
    }
    const installments = insts.map((i) => ({ ...i, cutoffDate: i.cutoffDate || i.dueDate }));
    const id = await run(
      () =>
        saveFee(db, {
          id: fee?.id,
          schoolId,
          name: name.trim(),
          type,
          classIds,
          installments,
          totalAmount: installments.length ? total : Number(flatAmount) || 0,
        }),
      'Frais enregistré.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title={fee ? `Modifier · ${fee.name}` : 'Nouveau frais'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
          <SelectField
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as FeeType)}
            hint={
              type === 'tuition'
                ? 'Appliqué à tous les élèves des classes choisies.'
                : type === 'special'
                  ? "Appliqué seulement aux élèves cochés dans leur fiche (ex. frais d'examen d'État)."
                  : `Appliqué aux élèves inscrits au service ${type === 'transport' ? 'transport' : 'cantine'}.`
            }
          >
            {(Object.keys(FEE_TYPE_LABELS) as FeeType[]).map((t) => (
              <option key={t} value={t}>
                {FEE_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Classes concernées (aucune cochée = toutes)</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            {classes.map((c) => (
              <Checkbox
                key={c.id}
                label={c.name}
                checked={classIds.includes(c.id)}
                onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((x) => x !== c.id))}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Tranches</h3>
          <span className="text-sm font-semibold">Total : {formatMoney(insts.length ? total : Number(flatAmount) || 0, currency)}</span>
        </div>
        {insts.length === 0 && (
          <Field label={`Montant unique (${currency})`} type="number" min={0} step="0.01" value={flatAmount} onChange={(e) => setFlatAmount(e.target.value)} />
        )}
        {insts.map((i, idx) => (
          <div key={i.id} className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1.2fr_0.8fr_1fr_1fr_0.9fr_auto] sm:items-end">
            <Field label="Nom" value={i.name} onChange={(e) => patch(idx, { name: e.target.value })} required />
            <Field label={`Montant (${currency})`} type="number" min={0} step="0.01" value={i.amount || ''} onChange={(e) => patch(idx, { amount: Number(e.target.value) })} required />
            <Field label="Date limite" type="date" value={i.dueDate} onChange={(e) => patch(idx, { dueDate: e.target.value })} required />
            <Field label="Date de renvoi" type="date" value={i.cutoffDate} onChange={(e) => patch(idx, { cutoffDate: e.target.value })} />
            <Field
              label="Seuil cumulé"
              type="number"
              min={0}
              step="0.01"
              value={i.minimumCumulative || ''}
              placeholder={String(auto[idx] || '')}
              onChange={(e) => patch(idx, { minimumCumulative: Number(e.target.value) })}
            />
            <IconButton label={`Supprimer ${i.name}`} onClick={() => setInsts((xs) => xs.filter((_, k) => k !== idx))} className="text-danger-ink">
              <Trash size={18} aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        <p className="text-[13px] leading-relaxed text-ink-3">
          Seuil cumulé : ce que l'élève doit avoir payé au total pour ce frais à la date de renvoi. Laissé vide, il vaut la somme des tranches
          jusqu'à celle-ci.
        </p>
        <Button variant="secondary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setInsts((xs) => [...xs, emptyInstallment(xs.length + 1)])} className="self-start">
          Ajouter une tranche
        </Button>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
