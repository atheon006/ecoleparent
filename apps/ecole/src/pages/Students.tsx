import {
  ATTENDANCE_LABELS,
  computeStudentFinance,
  formatMoney,
  formatShort,
  isValidPhone,
  phoneKey,
  summarizeAttendance,
  todayISO,
  type Attendance,
  type Conduct,
  type ParentLink,
  type PickupPerson,
  type Student,
} from '@pe/shared';
import { createStudent, deleteStudent, q, refs, setStudentActive, updateStudent, type StudentInput } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Badge, Button, Checkbox, Empty, ErrorNote, Field, IconButton, Modal, SelectField, TextArea, cx } from '@pe/shared/ui';
import { query } from 'firebase/firestore';
import { HeartPulse, Pencil, Plus, Printer, Trash2, Users, ScanText } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRole } from '../access';
import { ConfirmAction, PageHeader, SearchBox, Table, useAction } from '../components/common';
import { fullName, matchStudent, useSchool } from '../school';

export function StudentsPage() {
  const role = useRole();
  const { students, classes, myClasses } = useSchool();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const isAdmin = role === 'admin';

  const visibleClasses = role === 'professeur' ? myClasses : classes;
  const allowed = new Set(visibleClasses.map((c) => c.id));
  const list = students.filter(
    (s) => allowed.has(s.classId) && (!classId || s.classId === classId) && s.active !== showArchived && matchStudent(s, search),
  );

  return (
    <div>
      <PageHeader
        title="Élèves"
        description={isAdmin ? "Inscrivez les élèves et remettez à chaque famille sa fiche d'accès (code élève et QR code)." : undefined}
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" icon={<ScanText size={17} aria-hidden="true" />} onClick={() => (window.location.hash = '/importer?type=students')} disabled={classes.length === 0}>
                Importer une liste
              </Button>
              <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')} disabled={classes.length === 0}>
                Inscrire un élève
              </Button>
            </>
          )
        }
      />
      {isAdmin && classes.length === 0 && (
        <div className="mb-4">
          <ErrorNote>
            Créez d'abord au moins une classe dans <a href="#/classes" className="font-semibold underline">Classes</a>.
          </ErrorNote>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={setSearch} placeholder="Nom, matricule, parent ou téléphone" className="flex-1" />
        <select
          aria-label="Filtrer par classe"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="h-12 rounded-xl border border-field bg-surface px-3 text-[15px] sm:w-56"
        >
          <option value="">Toutes les classes</option>
          {visibleClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {isAdmin && (
        <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[#1e4a38]" />
          Afficher les élèves archivés
        </label>
      )}
      <p className="mb-2 text-sm text-ink-3">
        {list.length} élève{list.length > 1 ? 's' : ''}
      </p>
      {list.length === 0 ? (
        <Empty icon={<Users size={22} />} title={search ? 'Aucun résultat' : 'Aucun élève'}>
          {search ? 'Essayez un autre nom ou matricule.' : isAdmin ? 'Inscrivez votre premier élève.' : "Aucun élève dans vos classes pour l'instant."}
        </Empty>
      ) : (
        <Table head={['Élève', 'Classe', 'Matricule', 'Parent', '']}>
          {list.map((s) => (
            <tr key={s.id} className="hover:bg-ground/50">
              <td>
                <button type="button" onClick={() => setViewing(s)} className="text-left font-semibold text-ink hover:text-brand">
                  {fullName(s)}
                </button>
                <div className="text-xs text-ink-3">
                  {s.gender === 'F' ? 'Fille' : 'Garçon'}
                  {s.hasTransport && ' · transport'}
                  {s.hasCantine && ' · cantine'}
                </div>
              </td>
              <td className="whitespace-nowrap">{s.className}</td>
              <td className="font-mono text-[13px] whitespace-nowrap">{s.matricule}</td>
              <td>
                <div>{s.parentName}</div>
                <div className="text-xs text-ink-3">{s.parentPhone}</div>
              </td>
              <td className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => setViewing(s)}>
                  Fiche
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)} icon={<Pencil size={14} aria-hidden="true" />}>
                    Modifier
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <StudentForm student={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onCreated={(s) => setViewing(s)} />}
      {viewing && <StudentSheet student={students.find((s) => s.id === viewing.id) ?? viewing} onClose={() => setViewing(null)} onEdit={() => setEditing(viewing)} />}
    </div>
  );
}

// ── Formulaire d'inscription ───────────────────────────────────────────────

function StudentForm({ student, onClose, onCreated }: { student: Student | null; onClose: () => void; onCreated: (s: Student) => void }) {
  const { db } = getFirebase();
  const { school, classes, fees } = useSchool();
  const { busy, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<StudentInput>(() => ({
    schoolId: school!.id,
    classId: student?.classId ?? classes[0]?.id ?? '',
    className: student?.className ?? classes[0]?.name ?? '',
    firstName: student?.firstName ?? '',
    lastName: student?.lastName ?? '',
    gender: student?.gender ?? 'M',
    birthDate: student?.birthDate ?? '',
    parentName: student?.parentName ?? '',
    parentPhone: student?.parentPhone ?? '',
    parentPhone2: student?.parentPhone2 ?? '',
    parentEmail: student?.parentEmail ?? '',
    hasTransport: student?.hasTransport ?? false,
    hasCantine: student?.hasCantine ?? false,
    customFeeIds: student?.customFeeIds ?? [],
    bloodType: student?.bloodType ?? '',
    allergies: student?.allergies ?? '',
    medicalNotes: student?.medicalNotes ?? '',
    emergencyContact: student?.emergencyContact ?? '',
    pickups: student?.pickups ?? [],
  }));
  const set = <K extends keyof StudentInput>(k: K, v: StudentInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const specialFees = fees.filter((fee) => fee.type === 'special');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(f.parentPhone)) return setError('Le téléphone du parent doit compter au moins 9 chiffres.');
    if (f.parentPhone2 && !isValidPhone(f.parentPhone2)) return setError('Le second téléphone doit compter au moins 9 chiffres.');
    const className = classes.find((c) => c.id === f.classId)?.name ?? '';
    const pickups = (f.pickups ?? []).map((p) => ({ name: p.name.trim(), relation: p.relation.trim(), phone: p.phone.trim() })).filter((p) => p.name);
    if (pickups.some((p) => !isValidPhone(p.phone))) return setError('Indiquez un téléphone valide pour chaque personne autorisée.');
    const data = {
      ...f,
      className,
      birthDate: f.birthDate || undefined,
      parentEmail: f.parentEmail?.trim() || undefined,
      bloodType: f.bloodType || '',
      allergies: f.allergies?.trim() ?? '',
      medicalNotes: f.medicalNotes?.trim() ?? '',
      emergencyContact: f.emergencyContact?.trim() ?? '',
      pickups,
    };
    if (student) {
      const ok = await run(async () => {
        await updateStudent(db, student, data);
        return true;
      }, 'Fiche mise à jour.');
      if (ok) onClose();
    } else {
      const created = await run(() => createStudent(db, school!, data), 'Élève inscrit.');
      if (created) {
        onClose();
        onCreated(created);
      }
    }
  }

  return (
    <Modal open onClose={onClose} title={student ? `Modifier · ${student.firstName}` : 'Inscrire un élève'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} required />
          <Field label="Prénom (et post-nom)" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} required />
          <SelectField label="Sexe" value={f.gender} onChange={(e) => set('gender', e.target.value as 'M' | 'F')}>
            <option value="M">Garçon</option>
            <option value="F">Fille</option>
          </SelectField>
          <Field label="Date de naissance" type="date" value={f.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} />
          <SelectField label="Classe" value={f.classId} onChange={(e) => set('classId', e.target.value)} wrapperClassName="sm:col-span-2" required>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <h3 className="mt-2 text-base font-semibold">Parent ou tuteur</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom du parent" value={f.parentName} onChange={(e) => set('parentName', e.target.value)} required />
          <Field label="E-mail (facultatif)" type="email" value={f.parentEmail ?? ''} onChange={(e) => set('parentEmail', e.target.value)} />
          <Field
            label="Téléphone principal"
            type="tel"
            value={f.parentPhone}
            onChange={(e) => set('parentPhone', e.target.value)}
            hint="Le parent devra saisir ce numéro dans l'application pour suivre l'élève."
            required
          />
          <Field label="Second téléphone (facultatif)" type="tel" value={f.parentPhone2 ?? ''} onChange={(e) => set('parentPhone2', e.target.value)} hint="Autre parent ou tuteur." />
        </div>
        <h3 className="mt-2 text-base font-semibold">Services et frais</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          <Checkbox label="Transport scolaire" checked={f.hasTransport} onChange={(e) => set('hasTransport', e.target.checked)} />
          <Checkbox label="Cantine" checked={f.hasCantine} onChange={(e) => set('hasCantine', e.target.checked)} />
          {specialFees.map((fee) => (
            <Checkbox
              key={fee.id}
              label={fee.name}
              hint="Frais spécial"
              checked={f.customFeeIds.includes(fee.id)}
              onChange={(e) => set('customFeeIds', e.target.checked ? [...f.customFeeIds, fee.id] : f.customFeeIds.filter((x) => x !== fee.id))}
            />
          ))}
        </div>
        <h3 className="mt-2 text-base font-semibold">Santé (visible par le personnel et les parents)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Groupe sanguin" value={f.bloodType ?? ''} onChange={(e) => set('bloodType', e.target.value)}>
            <option value="">Inconnu</option>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </SelectField>
          <Field label="Allergies" value={f.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} placeholder="Arachides, pénicilline…" wrapperClassName="sm:col-span-2" />
          <Field label="Contact d'urgence" value={f.emergencyContact ?? ''} onChange={(e) => set('emergencyContact', e.target.value)} placeholder="Tante Marie · 0990 000 000" wrapperClassName="sm:col-span-3" />
          <TextArea label="Remarques médicales" rows={2} value={f.medicalNotes ?? ''} onChange={(e) => set('medicalNotes', e.target.value)} placeholder="Asthme : ventoline dans le sac" wrapperClassName="sm:col-span-3" />
        </div>
        <h3 className="mt-2 text-base font-semibold">Personnes autorisées à récupérer l'enfant</h3>
        <PickupsEditor value={f.pickups ?? []} onChange={(v) => set('pickups', v)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            {student ? 'Enregistrer' : 'Inscrire'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Fiche élève ────────────────────────────────────────────────────────────

function StudentSheet({ student: s, onClose, onEdit }: { student: Student; onClose: () => void; onEdit: () => void }) {
  const { db } = getFirebase();
  const role = useRole();
  const { school, fees, payments, currency } = useSchool();
  const { run } = useAction();
  const isAdmin = role === 'admin';
  const canSeeMoney = role === 'admin' || role === 'caissier';
  const attendance = useLiveQuery<Attendance>(`s-att:${s.id}`, () => q.childAttendance(db, s.id));
  const conduct = useLiveQuery<Conduct>(`s-cond:${s.id}`, () => q.childConduct(db, s.id));
  const parents = useLiveQuery<ParentLink>(`s-par:${s.id}`, () => query(refs.studentSub(db, s.id, 'parents')));
  const finance = useMemo(() => computeStudentFinance(s, fees, payments, todayISO()), [s, fees, payments]);
  const sum = summarizeAttendance(attendance.data);
  const [qr, setQr] = useState('');

  useEffect(() => {
    void QRCode.toDataURL(s.matricule, { margin: 1, width: 280, color: { dark: '#16231c', light: '#ffffff' } }).then(setQr);
  }, [s.matricule]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${s.firstName} ${s.lastName}`}
      wide
      footer={
        <>
          {isAdmin && (
            <>
              <ConfirmAction
                label="Supprimer"
                title="Supprimer cet élève ?"
                message="La fiche et le matricule seront supprimés. Les parents liés n'y auront plus accès. Pour un élève qui quitte l'école, préférez « Archiver »."
                confirmLabel="Supprimer définitivement"
                onConfirm={async () => {
                  await deleteStudent(db, s);
                  onClose();
                }}
              />
              <Button variant="ghost" onClick={() => void run(() => setStudentActive(db, s.id, !s.active), s.active ? 'Élève archivé.' : 'Élève réactivé.')}>
                {s.active ? 'Archiver' : 'Réactiver'}
              </Button>
              <Button variant="secondary" icon={<Pencil size={16} aria-hidden="true" />} onClick={onEdit}>
                Modifier
              </Button>
            </>
          )}
          <Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
            Imprimer la fiche parent
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Fiche d'accès imprimable remise aux parents */}
        <div className="print-area rounded-[14px] border-2 border-dashed border-brand/40 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {qr && <img src={qr} alt={`QR code du matricule ${s.matricule}`} className="size-36 shrink-0 self-center rounded-xl border border-line" />}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wider text-brand uppercase">{school?.name} · accès parent ParentEcole</span>
              <span className="text-lg font-semibold">
                {s.firstName} {s.lastName} · {s.className}
              </span>
              <span className="text-sm text-ink-3">Code élève</span>
              <span className="font-mono text-2xl font-semibold tracking-wider">{s.matricule}</span>
            </div>
          </div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-[14px] leading-relaxed text-ink-2">
            <li>Installez l'application ParentEcole sur votre téléphone Android.</li>
            <li>Créez votre compte avec votre adresse e-mail.</li>
            <li>
              Touchez « Scanner le QR code » ou saisissez le code élève, puis le numéro de téléphone donné à l'école (se terminant par{' '}
              <strong>…{phoneKey(s.parentPhone).slice(-3)}</strong>).
            </li>
          </ol>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Parent" value={`${s.parentName} · ${s.parentPhone}${s.parentPhone2 ? ` / ${s.parentPhone2}` : ''}`} />
          <Info label="Né(e) le" value={s.birthDate ? formatShort(s.birthDate) : '—'} />
          <Info
            label="Comptes parents liés"
            value={parents.data.length ? parents.data.map((p) => p.name || p.email).join(', ') : 'Aucun pour le moment'}
          />
          <Info label="Statut" value={s.active ? 'Inscrit' : 'Archivé'} />
        </div>

        {!!(s.bloodType || s.allergies || s.medicalNotes || s.emergencyContact || s.pickups?.length) && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <HeartPulse size={18} className="text-danger" aria-hidden="true" /> Santé et sortie
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.bloodType && <Info label="Groupe sanguin" value={s.bloodType} />}
              {s.allergies && <Info label="Allergies" value={s.allergies} />}
              {s.emergencyContact && <Info label="Contact d'urgence" value={s.emergencyContact} />}
              {s.medicalNotes && <Info label="Remarques médicales" value={s.medicalNotes} />}
            </div>
            {!!s.pickups?.length && (
              <ul className="flex flex-col divide-y divide-line-soft text-sm">
                {s.pickups.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2">
                    <span>
                      <strong>{p.name}</strong> · {p.relation}
                    </span>
                    <a href={`tel:${p.phone}`} className="font-semibold text-brand">
                      {p.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {canSeeMoney && (
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">Finances</h3>
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">Payé {formatMoney(finance.paid, currency)}</Badge>
              <Badge tone={finance.remaining ? 'warn' : 'brand'}>Reste {formatMoney(finance.remaining, currency)}</Badge>
              {finance.alerts[0]?.level === 'danger' && (
                <Badge tone="danger">
                  Renvoi le {formatShort(finance.alerts[0].status.installment.cutoffDate)} · manque {formatMoney(finance.alerts[0].status.missing, currency)}
                </Badge>
              )}
            </div>
            <ul className="flex flex-col divide-y divide-line-soft text-sm">
              {finance.fees.map((fs) => (
                <li key={fs.fee.id} className="flex justify-between gap-3 py-2">
                  <span>{fs.fee.name}</span>
                  <span className="font-semibold">
                    {formatMoney(fs.paid, currency)} / {formatMoney(fs.fee.totalAmount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">Présences</h3>
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{sum.present} présent</Badge>
            <Badge tone="danger">{sum.absent} absent</Badge>
            <Badge tone="warn">{sum.late} retard</Badge>
            <Badge tone="info">{sum.excused} justifié</Badge>
          </div>
          <ul className="text-sm text-ink-2">
            {attendance.data
              .filter((a) => a.status !== 'present')
              .slice(0, 6)
              .map((a) => (
                <li key={a.id}>
                  {formatShort(a.date)} · {ATTENDANCE_LABELS[a.status]}
                  {a.reason ? ` · ${a.reason}` : ''}
                </li>
              ))}
          </ul>
        </section>

        {conduct.data.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">Conduite</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {conduct.data.slice(0, 6).map((c) => (
                <li key={c.id} className={cx(c.severity === 'positive' ? 'text-brand' : 'text-ink-2')}>
                  {formatShort(c.date)} · <strong>{c.type}</strong> · {c.title}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

function PickupsEditor({ value, onChange }: { value: PickupPerson[]; onChange: (v: PickupPerson[]) => void }) {
  const set = (i: number, patch: Partial<PickupPerson>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="flex flex-col gap-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_2.75rem] gap-2 sm:grid-cols-[1fr_9rem_10rem_2.75rem]">
          <input aria-label="Nom" value={p.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Nom complet" className="h-11 min-w-0 rounded-xl border border-field bg-surface px-3 text-[15px]" />
          <input aria-label="Lien avec l'enfant" value={p.relation} onChange={(e) => set(i, { relation: e.target.value })} placeholder="Oncle, chauffeur…" className="col-start-1 h-11 min-w-0 rounded-xl border border-field bg-surface px-3 text-[15px] sm:col-start-auto" />
          <input aria-label="Téléphone" type="tel" value={p.phone} onChange={(e) => set(i, { phone: e.target.value })} placeholder="Téléphone" className="col-start-1 h-11 min-w-0 rounded-xl border border-field bg-surface px-3 text-[15px] sm:col-start-auto" />
          <IconButton label={`Retirer ${p.name || 'cette personne'}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="col-start-2 row-start-1 text-danger-ink sm:col-start-auto">
            <Trash2 size={18} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={16} aria-hidden="true" />} onClick={() => onChange([...value, { name: '', relation: '', phone: '' }])} className="self-start">
        Ajouter une personne
      </Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ground px-3.5 py-2.5">
      <div className="text-xs font-semibold text-ink-3">{label}</div>
      <div className="text-[15px] font-semibold">{value}</div>
    </div>
  );
}
