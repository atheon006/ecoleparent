import { formatLongCap, formatMoney, formatShort, todayISO, type PermissionSlip, type RsvpAnswer } from '@pe/shared';
import { answerPermission, errorMessage } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { SubHeader } from '../components/ChildPicker';
import { Btn, EmptyState, List, Note, Pill, Row, Section, Tile } from '../components/kit';
import { useParentData, type Child } from '../data';
import type { Nav } from '../nav';
import docImg from '../assets/illustrations/document.svg';

export function PermissionsScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  if (!active) return null;
  const today = todayISO();
  const toSign = active.permissions.filter((p) => !active.permissionAnswers.has(p.id) && p.deadline >= today);
  const answered = active.permissions.filter((p) => active.permissionAnswers.has(p.id));
  const missed = active.permissions.filter((p) => !active.permissionAnswers.has(p.id) && p.deadline < today);

  return (
    <div>
      <SubHeader title="Autorisations" subtitle={active.student.firstName} onBack={nav.back} />
      <Section title="À signer" count={toSign.length} />
      {toSign.length === 0 ? (
        <EmptyState icon="signature" image={docImg} title="Rien à signer">
          Les sorties et activités qui demandent votre accord apparaîtront ici.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {toSign.map((p) => (
            <SlipCard key={p.id} slip={p} child={active} />
          ))}
        </div>
      )}
      {answered.length > 0 && (
        <>
          <Section title="Déjà signées" />
          <List>
            {answered.map((p) => {
              const a = active.permissionAnswers.get(p.id)!;
              return (
                <Row
                  key={p.id}
                  left={<Tile icon={a.answer === 'yes' ? 'check-circle' : 'x'} tone={a.answer === 'yes' ? 'g' : 'c'} />}
                  title={p.title}
                  sub={`${a.answer === 'yes' ? 'Autorisée' : 'Refusée'} le ${formatShort(a.at.slice(0, 10))} · sortie le ${formatShort(p.date)}`}
                  end={<Pill tone={a.answer === 'yes' ? 'ok' : 'bad'}>{a.answer === 'yes' ? 'Oui' : 'Non'}</Pill>}
                />
              );
            })}
          </List>
        </>
      )}
      {missed.length > 0 && (
        <>
          <Section title="Délai dépassé" />
          <List>
            {missed.map((p) => (
              <Row key={p.id} left={<Tile icon="hourglass" tone="a" />} title={p.title} sub={`Il fallait répondre avant le ${formatShort(p.deadline)} : contactez l'école.`} />
            ))}
          </List>
        </>
      )}
      <Note icon="shield-check">Votre réponse est enregistrée avec votre nom et l'heure, comme une signature.</Note>
    </div>
  );
}

function SlipCard({ slip: p, child }: { slip: PermissionSlip; child: Child }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<RsvpAnswer | null>(null);

  async function answer(a: RsvpAnswer) {
    setBusy(a);
    try {
      await answerPermission(getFirebase().db, {
        permissionId: p.id,
        studentId: child.id,
        schoolId: child.student.schoolId,
        classId: child.student.classId,
        studentName: `${child.student.firstName} ${child.student.lastName}`,
        answer: a,
        uid: user!.uid,
        parentName: user!.displayName || user!.email || 'Parent',
      });
      toast(a === 'yes' ? 'Sortie autorisée.' : 'Refus enregistré.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="pe-card mx-4 p-4">
      <div className="flex items-start gap-3">
        <Tile icon="map-pin" tone="t" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">{p.title}</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {formatLongCap(p.date)}
            {p.time ? `, ${p.time}` : ''}
          </p>
          {p.description && <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{p.description}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {p.cost ? <Pill>Participation : {formatMoney(p.cost, child.currency)}</Pill> : null}
        <Pill tone="warn">Avant le {formatShort(p.deadline)}</Pill>
      </div>
      <div className="my-3 h-px bg-line-soft" />
      <p className="mb-2.5 text-[12.5px] text-ink-3">En signant, vous autorisez {child.student.firstName} à participer à cette activité.</p>
      <div className="grid grid-cols-2 gap-2.5">
        <Btn variant="ghost" onClick={() => void answer('no')} loading={busy === 'no'}>
          Refuser
        </Btn>
        <Btn icon="signature" onClick={() => void answer('yes')} loading={busy === 'yes'}>
          Autoriser
        </Btn>
      </div>
    </article>
  );
}
