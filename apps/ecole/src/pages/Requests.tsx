import { REQUEST_TYPE_LABELS, formatFull, formatShort, todayISO, type ParentRequest, type Student } from '@pe/shared';
import { handleRequest, q, updateStudent } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Card, Checkbox, Empty, Modal, Segmented, TextArea } from '@pe/shared/ui';
import { Inbox, Printer } from 'lucide-react';
import { useState } from 'react';
import { useAccess, useRole } from '../access';
import { PageHeader, useAction } from '../components/common';
import { fullName, useSchool } from '../school';

const tone = { attestation: 'info', pickup: 'warn', info: 'neutral' } as const;

export function RequestsPage() {
  const { db } = getFirebase();
  const { schoolId } = useSchool();
  const all = useLiveQuery<ParentRequest>(`requests:${schoolId}`, () => q.schoolRequests(db, schoolId));
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [handling, setHandling] = useState<ParentRequest | null>(null);
  const pending = all.data.filter((r) => r.status === 'pending');
  const list = tab === 'pending' ? pending : all.data.filter((r) => r.status !== 'pending');

  return (
    <div>
      <PageHeader title="Demandes des parents" description="Attestations, personnes autorisées à récupérer un enfant, corrections d'informations : le parent reçoit votre réponse dans l'application." />
      <Segmented
        label="Demandes"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: `À traiter (${pending.length})` },
          { value: 'done', label: 'Traitées' },
        ]}
        className="mb-4 sm:max-w-md"
      />
      {list.length === 0 ? (
        <Empty icon={<Inbox size={22} />} title={tab === 'pending' ? 'Aucune demande en attente' : 'Aucune demande traitée'} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => (
            <Card as="li" key={r.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone[r.type]}>{REQUEST_TYPE_LABELS[r.type]}</Badge>
                <span className="text-[13px] text-ink-3">{formatShort(r.createdAt.slice(0, 10))}</span>
                {r.status !== 'pending' && <Badge tone={r.status === 'done' ? 'brand' : 'danger'}>{r.status === 'done' ? 'Traitée' : 'Refusée'}</Badge>}
              </div>
              <span className="font-bold">
                {r.studentName} <span className="font-normal text-ink-3">· demandé par {r.parentName}</span>
              </span>
              {r.pickup && (
                <div className="rounded-xl bg-warn-soft/60 px-3 py-2 text-sm">
                  <strong>{r.pickup.name}</strong> ({r.pickup.relation}) · {r.pickup.phone}
                </div>
              )}
              {r.details && <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{r.details}</p>}
              {r.answer && (
                <p className="rounded-xl bg-ground px-3 py-2 text-sm">
                  <strong>Réponse :</strong> {r.answer}
                </p>
              )}
              {r.status === 'pending' && (
                <div className="pt-1">
                  <Button size="sm" onClick={() => setHandling(r)}>
                    Traiter
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
      {handling && <HandleForm request={handling} onClose={() => setHandling(null)} />}
    </div>
  );
}

function HandleForm({ request: r, onClose }: { request: ParentRequest; onClose: () => void }) {
  const { db } = getFirebase();
  const access = useAccess();
  const role = useRole();
  const { studentById } = useSchool();
  const { busy, run } = useAction();
  const student = studentById.get(r.studentId);
  const [answer, setAnswer] = useState(
    r.type === 'attestation' ? "L'attestation est prête : vous pouvez la retirer au secrétariat." : r.type === 'pickup' ? 'Cette personne est ajoutée à la fiche de votre enfant.' : '',
  );
  const [addPickup, setAddPickup] = useState(role === 'admin');
  const [printing, setPrinting] = useState(false);

  async function finish(status: 'done' | 'rejected') {
    const ok = await run(async () => {
      if (status === 'done' && r.type === 'pickup' && r.pickup && addPickup && student) {
        await updateStudent(db, student, { pickups: [...(student.pickups ?? []), r.pickup] });
      }
      await handleRequest(db, r, status, answer, access.name);
      return true;
    }, status === 'done' ? 'Demande traitée : le parent est prévenu.' : 'Demande refusée : le parent est prévenu.');
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={REQUEST_TYPE_LABELS[r.type]}
      wide
      footer={
        <>
          <Button variant="ghost" className="text-danger-ink hover:bg-danger-soft" loading={busy} onClick={() => void finish('rejected')} disabled={!answer.trim()}>
            Refuser
          </Button>
          <Button loading={busy} onClick={() => void finish('done')}>
            Marquer comme traitée
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px]">
          <strong>{r.studentName}</strong> · demandé par {r.parentName}
        </p>
        {r.details && <p className="rounded-xl bg-ground px-3.5 py-2.5 text-sm whitespace-pre-line">{r.details}</p>}
        {r.type === 'attestation' && student && (
          <>
            <Button variant="secondary" icon={<Printer size={16} aria-hidden="true" />} onClick={() => setPrinting(true)} className="self-start">
              Préparer l'attestation à imprimer
            </Button>
            {printing && <Attestation student={student} onClose={() => setPrinting(false)} />}
          </>
        )}
        {r.type === 'pickup' && r.pickup && (
          <div className="flex flex-col gap-2 rounded-xl bg-warn-soft/60 px-3.5 py-2.5 text-sm">
            <span>
              <strong>{r.pickup.name}</strong> ({r.pickup.relation}) · {r.pickup.phone}
            </span>
            {role === 'admin' ? (
              <Checkbox label="Ajouter cette personne à la fiche de l'élève" checked={addPickup} onChange={(e) => setAddPickup(e.target.checked)} />
            ) : (
              <span className="text-ink-2">Seule la direction peut modifier la fiche de l'élève.</span>
            )}
          </div>
        )}
        <TextArea label="Réponse au parent" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} hint="Obligatoire pour un refus." />
      </div>
    </Modal>
  );
}

function Attestation({ student: s, onClose }: { student: Student; onClose: () => void }) {
  const { school, year } = useSchool();
  return (
    <Modal
      open
      onClose={onClose}
      title="Attestation de fréquentation"
      wide
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
      <div className="print-area flex flex-col gap-6 p-6 font-serif text-[15px] leading-relaxed">
        <div className="flex items-center gap-3">
          {school?.logo && <img src={school.logo} alt="" className="size-16 object-contain" />}
          <div>
            <div className="text-lg font-bold">{school?.name}</div>
            {school?.address && <div className="text-sm">{school.address}</div>}
            {school?.phone && <div className="text-sm">Tél. {school.phone}</div>}
          </div>
        </div>
        <h2 className="text-center text-xl font-bold tracking-wide uppercase underline">Attestation de fréquentation</h2>
        <p>
          Je soussigné(e), {school?.directorName || '……………………………'}, chef d'établissement de {school?.name}, atteste que l'élève{' '}
          <strong>{fullName(s)}</strong>
          {s.birthDate ? `, né${s.gender === 'F' ? 'e' : ''} le ${formatFull(s.birthDate)}` : ''}, matricule <strong>{s.matricule}</strong>, est régulièrement inscrit
          {s.gender === 'F' ? 'e' : ''} en <strong>{s.className}</strong> pour l'année scolaire {year} et fréquente assidûment les cours.
        </p>
        <p>La présente attestation lui est délivrée pour servir et valoir ce que de droit.</p>
        <div className="flex justify-end pt-4">
          <div className="text-center">
            <div>Fait le {formatFull(todayISO())}</div>
            <div className="pt-14">Le chef d'établissement</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
