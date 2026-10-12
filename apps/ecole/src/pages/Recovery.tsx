import { computeStudentFinance, formatMoney, formatShort, todayISO, type AlertLevel } from '@pe/shared';
import { Badge, Button, Empty, Segmented } from '@pe/shared/ui';
import { CircleCheck, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader, Table, downloadCsv } from '../components/common';
import { fullName, useSchool } from '../school';

export function RecoveryPage() {
  const { students, fees, payments, classes, currency } = useSchool();
  const today = todayISO();
  const [level, setLevel] = useState<'danger' | 'all'>('danger');
  const [classId, setClassId] = useState('');

  const rows = useMemo(
    () =>
      students
        .filter((s) => s.active && (!classId || s.classId === classId))
        .flatMap((s) => {
          const f = computeStudentFinance(s, fees, payments, today);
          return f.alerts.map((a) => ({ s, a }));
        })
        .filter(({ a }) => (level === 'danger' ? a.level === 'danger' : a.level !== 'info'))
        .sort((x, y) => x.a.status.installment.cutoffDate.localeCompare(y.a.status.installment.cutoffDate) || y.a.status.missing - x.a.status.missing),
    [students, fees, payments, today, level, classId],
  );
  const totalMissing = rows.reduce((s, r) => s + r.a.status.missing, 0);

  const tone = (l: AlertLevel) => (l === 'danger' ? 'danger' : l === 'warning' ? 'warn' : 'neutral');
  const stateLabel = { renvoi: 'Renvoi dépassé', overdue: 'En retard', upcoming: 'À venir', paid: 'Payé' } as const;

  return (
    <div>
      <PageHeader
        title="Recouvrement"
        description="Élèves qui n'ont pas atteint le seuil de la prochaine tranche. Appelez les parents avant la date de renvoi."
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} aria-hidden="true" />}
            onClick={() =>
              downloadCsv(`recouvrement_${today}.csv`, [
                ['Élève', 'Classe', 'Frais', 'Tranche', 'Manque', 'Date limite', 'Date de renvoi', 'Parent', 'Téléphone'],
                ...rows.map(({ s, a }) => [
                  fullName(s),
                  s.className,
                  a.fee.name,
                  a.status.installment.name,
                  a.status.missing,
                  a.status.installment.dueDate,
                  a.status.installment.cutoffDate,
                  s.parentName,
                  s.parentPhone,
                ]),
              ])
            }
          >
            Exporter la liste
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          label="Urgence"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'danger', label: 'Urgent (renvoi)' },
            { value: 'all', label: 'Échéances à 30 jours' },
          ]}
          className="sm:w-[480px]"
        />
        <select aria-label="Filtrer par classe" value={classId} onChange={(e) => setClassId(e.target.value)} className="h-12 rounded-xl border border-field bg-surface px-3 sm:w-56">
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-ink-2">
        <strong>{rows.length}</strong> élève{rows.length > 1 ? 's' : ''} · <strong>{formatMoney(totalMissing, currency)}</strong> à recouvrer
      </p>
      {rows.length === 0 ? (
        <Empty icon={<CircleCheck size={22} />} title="Rien à recouvrer">
          Aucun élève n'est sous le seuil pour une échéance proche.
        </Empty>
      ) : (
        <Table head={['Élève', 'Frais', 'Manque', 'Échéance', 'Renvoi', 'Parent']}>
          {rows.map(({ s, a }) => (
            <tr key={`${s.id}-${a.fee.id}`}>
              <td>
                <div className="font-semibold">{fullName(s)}</div>
                <div className="text-xs text-ink-3">{s.className}</div>
              </td>
              <td>
                <div>{a.fee.name}</div>
                <div className="text-xs text-ink-3">{a.status.installment.name}</div>
              </td>
              <td className="font-semibold whitespace-nowrap text-danger-ink">{formatMoney(a.status.missing, currency)}</td>
              <td className="whitespace-nowrap">
                {formatShort(a.status.installment.dueDate)} <Badge tone={tone(a.level)}>{stateLabel[a.status.state]}</Badge>
              </td>
              <td className="whitespace-nowrap">{formatShort(a.status.installment.cutoffDate)}</td>
              <td>
                <div>{s.parentName}</div>
                <a href={`tel:${s.parentPhone.replace(/\s/g, '')}`} className="text-[13px] font-semibold text-brand">
                  {s.parentPhone}
                </a>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
