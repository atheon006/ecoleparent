import { ATTENDANCE_LABELS, formatLongCap, formatShort, type Attendance } from '@pe/shared';
import { q, reviewJustification } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Button, Card, Empty, Loading } from '@pe/shared/ui';
import { FileCheck } from 'lucide-react';
import { PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

export function JustificationsPage() {
  const { db } = getFirebase();
  const { schoolId, studentById } = useSchool();
  const pending = useLiveQuery<Attendance>(`justif:${schoolId}`, () => q.pendingJustifications(db, schoolId));
  const { run } = useAction();
  const list = [...pending.data].sort((a, b) => (a.justifiedAt ?? '').localeCompare(b.justifiedAt ?? ''));

  return (
    <div>
      <PageHeader title="Justifications" description="Motifs d'absence ou de retard envoyés par les parents depuis l'application. Une absence acceptée devient « justifiée »." />
      {pending.loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon={<FileCheck size={22} />} title="Aucune justification en attente" />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((a) => {
            const s = studentById.get(a.studentId);
            return (
              <Card as="li" key={a.id + a.studentId} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold">{a.studentName}</span>
                  <span className="text-sm text-ink-3">
                    {s?.className} · {ATTENDANCE_LABELS[a.status]} le {formatLongCap(a.date)}
                  </span>
                </div>
                <blockquote className="rounded-xl bg-ground px-3.5 py-2.5 text-[15px] leading-relaxed">« {a.justification} »</blockquote>
                <span className="text-xs text-ink-3">
                  Envoyé le {a.justifiedAt ? formatShort(a.justifiedAt.slice(0, 10)) : '—'}
                  {s ? ` · parent : ${s.parentName} (${s.parentPhone})` : ''}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void run(() => reviewJustification(db, a, true), 'Justification acceptée.')}>
                    Accepter
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void run(() => reviewJustification(db, a, false), 'Justification refusée.')}>
                    Refuser
                  </Button>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
