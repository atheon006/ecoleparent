import type { ClassRoom, Subject } from '@pe/shared';
import { deleteClass, saveClass, saveSubjects } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Button, Card, Empty, ErrorNote, Field, IconButton, Modal, SelectField } from '@pe/shared/ui';
import { BookMarked, LayoutGrid, Pencil, Plus, Trash2, ScanText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmAction, PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

const LEVELS = ['Maternelle', 'Primaire', 'Secondaire', 'Humanités', 'Autre'];

export function ClassesPage() {
  const { db } = getFirebase();
  const { schoolId, classes, students } = useSchool();
  const [editing, setEditing] = useState<ClassRoom | 'new' | null>(null);
  const [subjectsOf, setSubjectsOf] = useState<ClassRoom | null>(null);

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Les devoirs, l'appel, les notes et les communiqués ciblés se rattachent aux classes. Indiquez les branches de chaque classe pour les bulletins."
        actions={
          <>
            <Button variant="secondary" icon={<ScanText size={17} aria-hidden="true" />} onClick={() => (window.location.hash = '/importer?type=classes')}>
              Importer le programme
            </Button>
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')}>
              Nouvelle classe
            </Button>
          </>
        }
      />
      {classes.length === 0 ? (
        <Empty icon={<LayoutGrid size={22} />} title="Aucune classe" action={<Button onClick={() => setEditing('new')}>Créer une classe</Button>}>
          Créez les classes de l'école, par exemple « 6e Primaire B » ou « 3e Scientifique A ».
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const count = students.filter((s) => s.classId === c.id && s.active).length;
            return (
              <Card as="li" key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-ink-3">{c.level}</span>
                  <span className="text-base font-semibold">{c.name}</span>
                  <span className="text-sm text-ink-2">
                    {count} élève{count > 1 ? 's' : ''}
                    {c.titulaireName ? ` · titulaire : ${c.titulaireName}` : ''}
                  </span>
                  <span className="text-[13px] text-ink-3">
                    {c.subjects?.length
                      ? `${c.subjects.length} branche${c.subjects.length > 1 ? 's' : ''} · ${c.subjects.reduce((a, s) => a + s.max, 0)} points par période`
                      : 'Branches pas encore indiquées'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" icon={<BookMarked size={14} aria-hidden="true" />} onClick={() => setSubjectsOf(c)}>
                    Branches
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditing(c)}>
                    Modifier
                  </Button>
                  {count === 0 && (
                    <ConfirmAction
                      label="Supprimer"
                      title="Supprimer cette classe ?"
                      message={`La classe « ${c.name} » sera supprimée.`}
                      onConfirm={() => deleteClass(db, schoolId, c.id)}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      )}
      {editing && <ClassForm cls={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {subjectsOf && <SubjectsForm cls={classes.find((c) => c.id === subjectsOf.id) ?? subjectsOf} onClose={() => setSubjectsOf(null)} />}
    </div>
  );
}

function ClassForm({ cls, onClose }: { cls: ClassRoom | null; onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId, members } = useSchool();
  const { busy, run } = useAction();
  const [name, setName] = useState(cls?.name ?? '');
  const [level, setLevel] = useState(cls?.level ?? 'Primaire');
  const [titulaire, setTitulaire] = useState(cls?.titulaireEmail ?? '');
  const teachers = members.filter((m) => m.role === 'professeur' || m.role === 'surveillant');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = members.find((m) => m.email === titulaire);
    const id = await run(
      () => saveClass(db, { id: cls?.id, schoolId, name: name.trim(), level, titulaireEmail: t?.email ?? '', titulaireName: t?.name ?? '' }),
      cls ? 'Classe modifiée.' : 'Classe créée.',
    );
    if (id) onClose();
  }

  return (
    <Modal open onClose={onClose} title={cls ? 'Modifier la classe' : 'Nouvelle classe'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom de la classe" value={name} onChange={(e) => setName(e.target.value)} placeholder="6e Primaire B" required />
        <SelectField label="Niveau" value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </SelectField>
        <SelectField
          label="Titulaire"
          value={titulaire}
          onChange={(e) => setTitulaire(e.target.value)}
          hint="Pour qu'un professeur puisse faire l'appel et publier des devoirs, ajoutez aussi la classe dans sa fiche (Personnel)."
        >
          <option value="">Aucun</option>
          {teachers.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name}
            </option>
          ))}
        </SelectField>
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

// ── Branches et maxima ─────────────────────────────────────────────────────

/** Branches habituelles, à adapter : chaque école garde ses propres maxima. */
const TEMPLATES: Record<string, [string, number][]> = {
  Maternelle: [['Langage', 10], ['Éveil mathématique', 10], ['Dessin et coloriage', 10], ['Chant et récitation', 10], ['Vie pratique', 10]],
  Primaire: [
    ['Français', 40], ['Mathématiques', 40], ['Langues congolaises', 20], ['Sciences', 20], ['Géographie', 10], ['Histoire', 10],
    ['Éducation civique et morale', 10], ['Religion', 10], ['Dessin', 10], ['Éducation physique', 10], ['Écriture', 10],
  ],
  Secondaire: [
    ['Français', 40], ['Mathématiques', 40], ['Anglais', 20], ['Sciences', 30], ['Géographie', 20], ['Histoire', 20],
    ['Éducation civique et morale', 10], ['Religion', 10], ['Informatique', 10], ['Éducation physique', 10],
  ],
  Humanités: [
    ['Français', 40], ['Mathématiques', 50], ['Anglais', 20], ['Physique', 40], ['Chimie', 40], ['Biologie', 30],
    ['Géographie', 20], ['Histoire', 20], ['Éducation civique et morale', 10], ['Religion', 10], ['Informatique', 10], ['Éducation physique', 10],
  ],
};

const newId = () => Math.random().toString(36).slice(2, 10);

type SubjectRow = { id: string; name: string; max: string; examMax: string };

function SubjectsForm({ cls, onClose }: { cls: ClassRoom; onClose: () => void }) {
  const { db } = getFirebase();
  const { schoolId } = useSchool();
  const { busy, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubjectRow[]>(() =>
    (cls.subjects ?? []).map((s) => ({ id: s.id, name: s.name, max: String(s.max), examMax: s.examMax ? String(s.examMax) : '' })),
  );
  const template = TEMPLATES[cls.level] ?? TEMPLATES.Primaire;
  const set = (i: number, patch: Partial<SubjectRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = rows.reduce((a, r) => a + (Number(r.max) || 0), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const list: Subject[] = [];
    for (const r of rows) {
      if (!r.name.trim()) continue;
      const max = Number(r.max);
      const examMax = r.examMax ? Number(r.examMax) : undefined;
      if (!(max > 0)) return setError(`Indiquez un maximum valide pour « ${r.name} ».`);
      if (examMax !== undefined && !(examMax > 0)) return setError(`Le maximum d'examen de « ${r.name} » n'est pas valide.`);
      list.push({ id: r.id, name: r.name.trim(), max, examMax });
    }
    const names = list.map((s) => s.name.toLowerCase());
    if (new Set(names).size !== names.length) return setError('Deux branches portent le même nom.');
    const ok = await run(async () => {
      await saveSubjects(db, schoolId, cls.id, list);
      return true;
    }, 'Branches enregistrées.');
    if (ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Branches · ${cls.name}`} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Maximum de chaque branche par période. À l'examen, le maximum est le double, sauf si vous en indiquez un autre. Les notes des
          interrogations sont ramenées à ce maximum sur le bulletin.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {rows.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ground px-3.5 py-3 text-sm text-ink-2">
            <span>Aucune branche. Partez des branches habituelles du niveau « {cls.level} » et ajustez les maxima.</span>
            <Button size="sm" variant="secondary" onClick={() => setRows(template.map(([name, max]) => ({ id: newId(), name, max: String(max), examMax: '' })))}>
              Proposer les branches habituelles
            </Button>
          </div>
        )}
        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[1fr_7rem_7rem_2.75rem] gap-2 px-1 text-xs font-semibold text-ink-3 sm:grid">
              <span>Branche</span>
              <span>Max période</span>
              <span>Max examen</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[1fr_5.5rem_2.75rem] gap-2 sm:grid-cols-[1fr_7rem_7rem_2.75rem]">
                <input
                  aria-label="Nom de la branche"
                  value={r.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  placeholder="Mathématiques"
                  className="h-11 min-w-0 rounded-xl border border-field bg-surface px-3 text-[15px]"
                />
                <input
                  aria-label={`Maximum par période · ${r.name}`}
                  inputMode="decimal"
                  value={r.max}
                  onChange={(e) => set(i, { max: e.target.value.replace(',', '.') })}
                  className="h-11 rounded-xl border border-field bg-surface px-3 text-[15px]"
                />
                <input
                  aria-label={`Maximum à l'examen · ${r.name}`}
                  inputMode="decimal"
                  value={r.examMax}
                  placeholder={r.max ? String(Number(r.max) * 2 || '') : ''}
                  onChange={(e) => set(i, { examMax: e.target.value.replace(',', '.') })}
                  className="col-start-2 row-start-2 h-11 rounded-xl border border-field bg-surface px-3 text-[15px] sm:col-start-auto sm:row-start-auto"
                />
                <IconButton label={`Retirer ${r.name || 'la branche'}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="text-danger-ink">
                  <Trash2 size={18} aria-hidden="true" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setRows((r) => [...r, { id: newId(), name: '', max: '10', examMax: '' }])}>
            Ajouter une branche
          </Button>
          {rows.length > 0 && <span className="text-sm text-ink-2">Total par période : <strong>{total}</strong> points</span>}
        </div>
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
