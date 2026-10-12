import { formatMoney, formatShort, type DocumentCategory } from '@pe/shared';
import { useState } from 'react';
import { SubHeader } from '../components/ChildPicker';
import { Icon, type IconName } from '../components/Icon';
import { Btn, EmptyState, List, Note, Pill, Row, Section, Tile, type Tone } from '../components/kit';
import { useParentData } from '../data';
import { isNative } from '../native';
import type { Nav } from '../nav';
import { RequestForm } from './ChildProfile';

const DOC_STYLE: Record<DocumentCategory, { icon: IconName; tone: Tone }> = {
  Règlement: { icon: 'scales', tone: 'a' },
  Calendrier: { icon: 'calendar-blank', tone: 't' },
  Fournitures: { icon: 'notebook', tone: 'v' },
  Formulaire: { icon: 'file-text', tone: 'b' },
  Autre: { icon: 'file-pdf', tone: 'c' },
};

export function DocumentsScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  const [asking, setAsking] = useState(false);
  if (!active) return null;
  const attestations = active.requests.filter((r) => r.type === 'attestation');
  const lastAttestation = attestations[0];

  return (
    <div>
      <SubHeader title="Documents" subtitle={active.student.firstName} onBack={nav.back} />

      <Section title="Attestation de fréquentation" />
      <List>
        <Row
          left={<Tile icon="certificate" tone="g" />}
          title="Attestation de fréquentation"
          sub={
            !lastAttestation
              ? 'Préparée par la direction, à retirer à l’école'
              : lastAttestation.status === 'pending'
                ? `Demandée le ${formatShort(lastAttestation.createdAt.slice(0, 10))} · en préparation`
                : lastAttestation.answer || (lastAttestation.status === 'done' ? 'Prête' : 'Refusée')
          }
          end={
            lastAttestation?.status === 'pending' ? (
              <Pill tone="warn">En cours</Pill>
            ) : (
              <Btn size="sm" variant="soft" onClick={() => setAsking(true)}>
                Demander
              </Btn>
            )
          }
        />
      </List>

      <Section title="Documents de l'école" />
      {active.documents.length === 0 ? (
        <List>
          <Row left={<Tile icon="folder-simple" tone="b" />} title="Aucun document pour l'instant" sub="Règlement, liste des fournitures, calendrier… publiés par l'école" />
        </List>
      ) : (
        <div className="pe-card mx-4 overflow-hidden [&>*+*]:border-t [&>*+*]:border-line-soft">
          {active.documents.map((d) => {
            const st = DOC_STYLE[d.category] ?? DOC_STYLE.Autre;
            return (
              <a key={d.id} href={d.url} target={isNative ? undefined : '_blank'} rel="noreferrer" className="flex items-center gap-3 px-4 py-3">
                <Tile icon={st.icon} tone={st.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{d.title}</span>
                  <span className="block text-[13px] text-ink-3">{d.category}</span>
                </span>
                <Icon name="export" size={18} className="text-ink-3" />
              </a>
            );
          })}
        </div>
      )}

      <Section title="Bulletins" />
      {active.bulletins.length === 0 ? (
        <EmptyState icon="certificate" title="Aucun bulletin publié" />
      ) : (
        <List>
          {active.bulletins.map((b) => (
            <Row key={b.id} left={<Tile icon="file-pdf" />} title={`${b.periodLabel} ${b.year}`} sub={b.className} onClick={() => nav.push({ name: 'bulletin', id: b.id })} />
          ))}
        </List>
      )}

      {active.payments.length > 0 && (
        <>
          <Section title="Reçus" />
          <List>
            {active.payments.map((p) => (
              <Row
                key={p.id}
                left={<Tile icon="receipt" tone="b" />}
                title={`Reçu ${p.reference}`}
                sub={`${formatMoney(p.amount, active.currency)} · ${formatShort(p.date)}`}
                onClick={() => nav.push({ name: 'receipt', id: p.id })}
              />
            ))}
          </List>
        </>
      )}
      <Note icon="info">Les documents de l'école s'ouvrent dans votre navigateur.</Note>
      {asking && <RequestForm child={active} type="attestation" onClose={() => setAsking(false)} />}
    </div>
  );
}
