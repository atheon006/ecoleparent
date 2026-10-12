import { REQUEST_TYPE_LABELS, formatFull, formatShort, isValidPhone, type RequestType } from '@pe/shared';
import { cancelRequest, createRequest, errorMessage, unlinkChild } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { Button, ErrorNote, Field, Modal, TextArea, useToast } from '@pe/shared/ui';
import { useState } from 'react';
import { Avatar, SubHeader } from '../components/ChildPicker';
import { List, Note, Pill, Row, Section, Tile } from '../components/kit';
import { useParentData, type Child } from '../data';
import { nameInitials } from '../helpers';
import { shareText } from '../native';
import type { Nav } from '../nav';

export function ChildProfile({ nav }: { nav: Nav }) {
  const { active, links } = useParentData();
  const toast = useToast();
  const [asking, setAsking] = useState<RequestType | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!active) return null;
  const s = active.student;
  const pending = active.requests.filter((r) => r.status === 'pending' && r.type !== 'attestation');

  async function remove() {
    setBusy(true);
    try {
      await unlinkChild(getFirebase().db, active!.link, links.filter((l) => l.studentId !== active!.id));
      toast(`${s.firstName} a été retiré de votre compte.`);
      nav.go('home');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SubHeader title="Profil de l'enfant" onBack={nav.back} />
      <div className="flex flex-col items-center px-4 pt-1 pb-2 text-center">
        <Avatar child={active} size={92} />
        <div className="mt-2 text-[22px] font-semibold">
          {s.firstName} {s.lastName}
        </div>
        <div className="text-ink-3">
          {s.className} · {active.school?.name}
        </div>
      </div>
      <List>
        <Row
          left={<Tile icon="identification-card" tone="g" />}
          title="Code élève"
          sub={<span className="font-mono tracking-wide">{s.matricule}</span>}
          end={<Pill>Partager</Pill>}
          chevron={false}
          onClick={() => void shareText('Code élève ParentEcole', `Code élève de ${s.firstName} ${s.lastName} sur ParentEcole : ${s.matricule}`).catch(() => undefined)}
        />
        {s.birthDate && <Row left={<Tile icon="calendar-blank" tone="b" />} title="Date de naissance" sub={formatFull(s.birthDate)} />}
        {active.classRoom?.titulaireName && <Row left={<Tile icon="chalkboard-teacher" tone="v" />} title="Titulaire" sub={active.classRoom.titulaireName} />}
      </List>

      <Section title="Santé" />
      <List>
        <Row left={<Tile icon="drop" />} title="Groupe sanguin" sub={s.bloodType || 'Non renseigné'} />
        <Row left={<Tile icon="warning-circle" tone="a" />} title="Allergies" sub={s.allergies || 'Aucune signalée'} />
        <Row left={<Tile icon="first-aid-kit" tone="t" />} title="En cas d'urgence" sub={s.emergencyContact || `Appeler ${s.parentName}`} />
        {s.medicalNotes && <Row left={<Tile icon="heartbeat" />} title="Remarques médicales" sub={s.medicalNotes} />}
      </List>

      <Section title="Personnes autorisées à le récupérer" />
      <List>
        {(s.pickups ?? []).map((p, i) => (
          <Row
            key={i}
            left={<span className="tone-a flex size-[42px] shrink-0 items-center justify-center rounded-full text-sm font-semibold">{nameInitials(p.name)}</span>}
            title={p.name}
            sub={`${p.relation} · ${p.phone}`}
          />
        ))}
        <Row left={<Tile icon="user-plus" tone="g" />} title="Ajouter une personne" sub="La direction valide chaque ajout" onClick={() => setAsking('pickup')} />
      </List>

      {pending.length > 0 && (
        <>
          <Section title="Demandes en cours" />
          <List>
            {pending.map((r) => (
              <Row
                key={r.id}
                left={<Tile icon="hourglass" tone="a" />}
                title={REQUEST_TYPE_LABELS[r.type]}
                sub={`Envoyée le ${formatShort(r.createdAt.slice(0, 10))}${r.pickup ? ` · ${r.pickup.name}` : ''}`}
                end={
                  <button type="button" onClick={() => void cancelRequest(getFirebase().db, r).catch((e) => toast(errorMessage(e), 'error'))} className="text-[12.5px] font-semibold text-ink-3">
                    Annuler
                  </button>
                }
              />
            ))}
          </List>
        </>
      )}

      <Section title="Une information à corriger ?" />
      <List>
        <Row left={<Tile icon="pencil-simple" tone="b" />} title="Signaler une correction" sub="Nom, date de naissance, téléphone, santé…" onClick={() => setAsking('info')} />
        <Row left={<Tile icon="trash" tone="c" />} title="Retirer cet enfant de mon compte" chevron={false} onClick={() => setRemoving(true)} />
      </List>
      <Note icon="shield-check">Ces informations sont tenues par l'école. Vos demandes lui sont transmises et vous recevez sa réponse ici.</Note>

      {asking && <RequestForm child={active} type={asking} onClose={() => setAsking(null)} />}
      <Modal
        open={removing}
        onClose={() => setRemoving(false)}
        title="Retirer cet enfant ?"
        sheet
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Retirer
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-ink-2">
          Vous ne verrez plus les informations de {s.firstName}. Vous pourrez le rajouter plus tard avec son code élève.
        </p>
      </Modal>
    </div>
  );
}

export function RequestForm({ child, type, onClose }: { child: Child; type: RequestType; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (type === 'pickup') {
      if (!name.trim() || !relation.trim()) return setError('Indiquez le nom et le lien avec l’enfant.');
      if (!isValidPhone(phone)) return setError('Le téléphone doit compter au moins 9 chiffres.');
    } else if (type === 'info' && !details.trim()) return setError('Décrivez la correction à faire.');
    setBusy(true);
    try {
      await createRequest(getFirebase().db, {
        studentId: child.id,
        schoolId: child.student.schoolId,
        classId: child.student.classId,
        studentName: `${child.student.firstName} ${child.student.lastName}`,
        type,
        details: details.trim(),
        pickup: type === 'pickup' ? { name: name.trim(), relation: relation.trim(), phone: phone.trim() } : undefined,
        uid: user!.uid,
        parentName: user!.displayName || user!.email || 'Parent',
      });
      toast("Demande envoyée à l'école.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={REQUEST_TYPE_LABELS[type]}
      sheet
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} onClick={() => void send()}>
            Envoyer à l'école
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {type === 'pickup' && (
          <>
            <Field label="Nom complet" value={name} onChange={(e) => setName(e.target.value)} />
            <Field label="Lien avec l'enfant" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Oncle, grand-mère, chauffeur…" />
            <Field label="Téléphone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        <TextArea
          label={type === 'attestation' ? 'Pour quel usage ? (facultatif)' : type === 'pickup' ? 'Précisions (facultatif)' : 'Que faut-il corriger ?'}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={type === 'attestation' ? 'Dossier de bourse, ambassade…' : type === 'info' ? 'La date de naissance est le 12 mars 2015.' : ''}
        />
      </div>
    </Modal>
  );
}
