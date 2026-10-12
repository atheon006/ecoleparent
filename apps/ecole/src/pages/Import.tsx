import { WEEKDAY_LABELS, isValidPhone, todayISO, type ClassRoom, type Student, type Subject, type Timetable, type TimetableSlot, type Weekday } from '@pe/shared';
import {
  addHomework,
  aiImportAvailable,
  analyzeDocument,
  createStudent,
  q,
  saveClass,
  saveSubjects,
  saveTimetable,
  type AiClass,
  type AiQuestion,
  type AiResults,
  type AiSlot,
  type AiStudent,
  type ImportKind,
} from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { useLiveQuery } from '@pe/shared/hooks';
import { Button, Checkbox, ErrorNote, Field, IconButton, SelectField, Spinner, cx, useToast } from '@pe/shared/ui';
import { Camera, FileText, Printer, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useAccess, useRole } from '../access';
import illustration from '../assets/import.svg';
import { PageHeader } from '../components/common';
import { ACCEPTED, prepareDocument, type PreparedDocument } from '../document';
import { navigate } from '../router';
import { norm, useSchool } from '../school';

// Import de documents avec Gemini : élèves, classes et branches, horaire, interrogation.
// Gemini propose, la direction vérifie : rien n'est enregistré sans validation.

const KINDS: { id: ImportKind; title: string; hint: string }[] = [
  { id: 'students', title: 'Des élèves', hint: "Liste d'inscription, registre, tableau du secrétariat" },
  { id: 'classes', title: 'Classes et branches', hint: 'Programme ou grille des maxima' },
  { id: 'timetable', title: "L'horaire d'une classe", hint: "Photo de l'horaire affiché en classe" },
  { id: 'quiz', title: 'Une interrogation', hint: 'Questions préparées depuis un cours' },
];

const LEVELS = ['Maternelle', 'Primaire', 'Secondaire', 'Humanités', 'Autre'];

const newId = () => Math.random().toString(36).slice(2, 10);

/** Type demandé dans l'adresse : #/importer?type=classes */
function kindFromHash(): ImportKind | null {
  const t = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('type');
  return KINDS.some((k) => k.id === t) ? (t as ImportKind) : null;
}

/** Rapproche « 6e B » d'une classe « 6e Primaire B » (même numéro et même lettre). */
export function matchClass(name: string, classes: ClassRoom[]): string {
  const n = norm(name);
  if (!n) return '';
  const exact = classes.find((c) => norm(c.name) === n);
  if (exact) return exact.id;
  const parts = (s: string) => {
    const num = /(\d+)/.exec(s)?.[1] ?? '';
    const letter = /(?:^|\s)([a-z])$/.exec(s.trim())?.[1] ?? '';
    return { num, letter };
  };
  const a = parts(n);
  if (!a.num) return '';
  const same = classes.filter((c) => {
    const b = parts(norm(c.name));
    return b.num === a.num && (!a.letter || !b.letter || a.letter === b.letter);
  });
  return same.length === 1 ? same[0].id : '';
}

export function ImportPage() {
  const { db } = getFirebase();
  const role = useRole();
  const { schoolId, classes, myClasses } = useSchool();
  const allowed = role === 'admin' ? KINDS : KINDS.filter((k) => k.id === 'quiz');
  const [kind, setKind] = useState<ImportKind>(() => {
    const k = kindFromHash();
    return k && allowed.some((a) => a.id === k) ? k : allowed[0].id;
  });
  const [quizClass, setQuizClass] = useState(myClasses[0]?.id ?? '');
  const [quizSubject, setQuizSubject] = useState('');
  const [quizCount, setQuizCount] = useState('10');
  const [doc, setDoc] = useState<PreparedDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: ImportKind; data: AiResults[ImportKind]; doc: PreparedDocument } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  // Compteur pendant l'analyse : on voit que le travail avance.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function analyze(file: File) {
    setError(null);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const prepared = await prepareDocument(file);
      setDoc(prepared);
      const cls = myClasses.find((c) => c.id === quizClass);
      const hints =
        kind === 'quiz'
          ? { level: cls?.name, subject: quizSubject || undefined, count: Number(quizCount) || 10 }
          : { classes: classes.map((c) => c.name) };
      const { result: data } = await analyzeDocument(db, schoolId, kind, { file: prepared.file, text: prepared.text }, hints, abort.current.signal);
      setResult({ kind, data, doc: prepared });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void analyze(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };
  const reset = () => {
    setResult(null);
    setDoc(null);
    setError(null);
  };

  if (result) {
    const props = { doc: result.doc, onCancel: reset };
    return (
      <div>
        <PageHeader title={KINDS.find((k) => k.id === result.kind)!.title.replace(/^Des /, 'Vérifiez les ').replace(/^Une /, 'Votre ')} description={`${result.doc.name} · lu par Gemini. Corrigez si besoin, puis validez.`} />
        {result.kind === 'students' && <StudentsReview data={result.data as AiResults['students']} {...props} />}
        {result.kind === 'classes' && <ClassesReview data={result.data as AiResults['classes']} {...props} />}
        {result.kind === 'timetable' && <TimetableReview data={result.data as AiResults['timetable']} {...props} />}
        {result.kind === 'quiz' && <QuizReview data={result.data as AiResults['quiz']} classId={quizClass} subject={quizSubject} {...props} />}
      </div>
    );
  }

  const quizSubjects = myClasses.find((c) => c.id === quizClass)?.subjects ?? [];

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Importer avec Gemini"
        description="Envoyez un document tel que vous l'avez : Gemini le lit et prépare les fiches. Vous vérifiez tout avant que quoi que ce soit soit enregistré."
      />
      {!aiImportAvailable && <ErrorNote>Le service d'analyse n'est pas configuré pour cette version du site.</ErrorNote>}

      <fieldset className="mt-2">
        <legend className="mb-2.5 text-sm font-semibold">Que voulez-vous importer ?</legend>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {allowed.map((k) => (
            <label
              key={k.id}
              className={cx('flex cursor-pointer gap-3 rounded-xl border px-4 py-3.5', kind === k.id ? 'border-brand bg-brand-soft' : 'border-line hover:border-field')}
            >
              <input type="radio" name="kind" checked={kind === k.id} onChange={() => setKind(k.id)} className="mt-1 size-4 shrink-0 accent-brand" />
              <span>
                <span className="block text-[15px] font-semibold">{k.title}</span>
                <span className="block text-[13px] text-ink-3">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'quiz' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SelectField label="Classe" value={quizClass} onChange={(e) => setQuizClass(e.target.value)}>
            {myClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Field label="Branche" list="quiz-subjects" value={quizSubject} onChange={(e) => setQuizSubject(e.target.value)} placeholder="Sciences" />
          <datalist id="quiz-subjects">
            {quizSubjects.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <SelectField label="Nombre de questions" value={quizCount} onChange={(e) => setQuizCount(e.target.value)}>
            {['5', '8', '10', '15', '20'].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </SelectField>
        </div>
      )}

      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx('mt-5 flex flex-wrap items-center gap-7 rounded-2xl border-[1.5px] border-dashed p-7', dragging ? 'border-brand bg-brand-soft' : 'border-field')}
      >
        <img src={illustration} alt="" className="h-36 w-48 max-w-full object-contain" />
        <div className="min-w-0 flex-[1_1_280px]">
          {busy ? (
            <div className="flex items-center gap-3" role="status">
              <Spinner className="size-5 text-brand" />
              <div>
                <div className="text-[17px] font-semibold">Gemini lit le document…</div>
                <div className="text-sm text-ink-3">
                  {doc ? `${doc.name} · ${doc.label}` : 'Préparation du fichier'} · {elapsed} s · en général 15 à 40 secondes
                </div>
                <button type="button" onClick={() => abort.current?.abort()} className="mt-2 text-sm font-semibold text-brand">
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[17px] font-semibold">Déposez le document ici</div>
              <div className="mt-0.5 text-sm text-ink-3">PDF, Word, Excel ou photo d'une liste écrite à la main · 11 Mo au plus</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <label className={cx('inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white', (!aiImportAvailable || (kind === 'quiz' && !quizClass)) && 'pointer-events-none opacity-60')}>
                  <Upload size={17} aria-hidden="true" /> Choisir un fichier
                  <input type="file" accept={ACCEPTED} className="sr-only" onChange={(e) => onFiles(e.target.files)} />
                </label>
                <label className={cx('inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-field px-4 text-sm font-semibold text-ink', !aiImportAvailable && 'pointer-events-none opacity-60')}>
                  <Camera size={17} aria-hidden="true" /> Prendre une photo
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
                </label>
              </div>
            </>
          )}
        </div>
      </section>
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ['Gemini lit le document', 'Il repère les noms, les classes, les dates, les téléphones ou les questions.'],
          ['Vous vérifiez', 'Les lignes douteuses sont signalées ; tout se corrige sur place.'],
          ['Vous validez', 'Les fiches sont créées comme une saisie normale, avec matricule et accès parent.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-field text-xs font-semibold">{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-[13px] text-ink-3">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex items-start gap-2 text-[13px] text-ink-3">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Le document sert uniquement à cette analyse : ParentEcole ne le conserve pas.
      </p>
    </div>
  );
}

function FileBar({ doc, onCancel, children }: { doc: PreparedDocument; onCancel: () => void; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
      <FileText size={20} className="text-ink-3" aria-hidden="true" />
      <div className="min-w-0 flex-[1_1_220px]">
        <div className="truncate font-semibold">{doc.name}</div>
        <div className="text-[13px] text-ink-3">{doc.label} · lu par Gemini</div>
      </div>
      {children}
      <button type="button" onClick={onCancel} className="text-sm font-semibold text-brand">
        Changer de fichier
      </button>
    </div>
  );
}

const cell = 'h-9 w-full min-w-0 rounded-lg border bg-surface px-2.5 text-sm outline-none focus:border-brand';

// ── Élèves ─────────────────────────────────────────────────────────────────

type StudentRow = AiStudent & { key: string; include: boolean; classId: string; duplicate?: Student };

function problems(r: StudentRow): string[] {
  const out: string[] = [];
  if (!r.lastName.trim() || !r.firstName.trim()) out.push('Nom à compléter');
  if (r.gender !== 'M' && r.gender !== 'F') out.push('Sexe à choisir');
  if (!r.classId) out.push('Classe à choisir');
  if (!isValidPhone(r.parentPhone)) out.push('Téléphone à saisir');
  if (r.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.birthDate)) out.push('Date à vérifier');
  return out;
}

function StudentsReview({ data, doc, onCancel }: { data: AiResults['students']; doc: PreparedDocument; onCancel: () => void }) {
  const { db } = getFirebase();
  const toast = useToast();
  const { school, classes, students } = useSchool();
  const [rows, setRows] = useState<StudentRow[]>(() =>
    data.students.map((s, i) => {
      const duplicate = students.find((st) => norm(st.lastName) === norm(s.lastName) && norm(st.firstName) === norm(s.firstName));
      return { ...s, key: String(i), classId: matchClass(s.className, classes), include: !duplicate, duplicate };
    }),
  );
  const [filter, setFilter] = useState<'all' | 'fix' | 'dup'>('all');
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const set = (key: string, patch: Partial<StudentRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const toFix = rows.filter((r) => !r.duplicate && problems(r).length > 0);
  const dups = rows.filter((r) => r.duplicate);
  const ready = rows.filter((r) => r.include && !r.duplicate && problems(r).length === 0);
  const shown = filter === 'fix' ? toFix : filter === 'dup' ? dups : rows;
  const noClass = rows.filter((r) => !r.classId).length;

  async function add() {
    if (!school) return;
    setProgress(0);
    const errors: string[] = [];
    for (const [i, r] of ready.entries()) {
      const cls = classes.find((c) => c.id === r.classId)!;
      try {
        await createStudent(db, school, {
          schoolId: school.id,
          classId: cls.id,
          className: cls.name,
          firstName: r.firstName.trim(),
          lastName: r.lastName.trim().toUpperCase(),
          gender: r.gender as 'M' | 'F',
          birthDate: r.birthDate || undefined,
          parentName: r.parentName.trim() || `Parent de ${r.firstName.trim()}`,
          parentPhone: r.parentPhone.trim(),
          parentPhone2: r.parentPhone2?.trim() || undefined,
          hasTransport: false,
          hasCantine: false,
          customFeeIds: [],
        });
        setRows((rs) => rs.filter((x) => x.key !== r.key));
      } catch (err) {
        errors.push(`${r.lastName} ${r.firstName} : ${(err as Error).message}`);
      }
      setProgress(i + 1);
    }
    setProgress(null);
    setFailed(errors);
    const done = ready.length - errors.length;
    toast(`${done} élève${done > 1 ? 's' : ''} inscrit${done > 1 ? 's' : ''}, avec matricule et fiche d'accès parent.`);
    if (!errors.length && rows.length === ready.length) navigate('eleves');
  }

  return (
    <div>
      <FileBar doc={doc} onCancel={onCancel}>
        <span className="text-[13px] text-ink-3">{data.students.length} élèves trouvés</span>
      </FileBar>
      {data.remark && <p className="mb-3 text-sm text-ink-2">Remarque de Gemini : {data.remark}</p>}
      {noClass > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-ground px-4 py-3 text-sm">
          <span>
            {noClass} élève{noClass > 1 ? 's' : ''} sans classe reconnue. Classe à leur donner :
          </span>
          <select
            aria-label="Classe pour les élèves sans classe"
            defaultValue=""
            onChange={(e) => e.target.value && setRows((rs) => rs.map((r) => (r.classId ? r : { ...r, classId: e.target.value })))}
            className="h-9 rounded-lg border border-field bg-surface px-2 text-sm"
          >
            <option value="">Choisir…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div role="tablist" aria-label="Filtrer" className="flex gap-6 border-b border-line">
        {(
          [
            ['all', 'Tous', rows.length],
            ['fix', 'À corriger', toFix.length],
            ['dup', 'Déjà inscrits', dups.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={cx('-mb-px border-b-2 py-2.5 text-sm', filter === id ? 'border-brand font-semibold' : 'border-transparent text-ink-3')}
          >
            {label} <span className={cx('font-semibold', id === 'fix' && n > 0 ? 'text-warn' : 'text-ink-4')}>{n}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs text-ink-3">
              <th className="w-9 py-2.5 font-semibold" />
              <th className="w-[12%] py-2.5 pr-2 font-semibold">Nom</th>
              <th className="w-[15%] py-2.5 pr-2 font-semibold">Post-nom et prénom</th>
              <th className="w-[72px] py-2.5 pr-2 font-semibold">Sexe</th>
              <th className="w-[148px] py-2.5 pr-2 font-semibold">Né(e) le</th>
              <th className="w-[14%] py-2.5 pr-2 font-semibold">Classe</th>
              <th className="w-[12%] py-2.5 pr-2 font-semibold">Parent</th>
              <th className="w-[13%] py-2.5 pr-2 font-semibold">Téléphone</th>
              <th className="py-2.5 font-semibold">État</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const pb = problems(r);
              const warn = (field: string, bad: boolean) => cx(cell, bad || r.uncertain.includes(field) ? 'border-[#e3b25c] bg-warn-soft' : 'border-transparent hover:border-field');
              return (
                <tr key={r.key} className={cx('border-t border-line-soft', r.duplicate && 'text-ink-4')}>
                  <td className="py-1.5">
                    <input type="checkbox" aria-label={`Retenir ${r.firstName} ${r.lastName}`} checked={r.include && !r.duplicate} disabled={!!r.duplicate} onChange={(e) => set(r.key, { include: e.target.checked })} className="size-4 accent-brand" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label="Nom" value={r.lastName} onChange={(e) => set(r.key, { lastName: e.target.value })} className={warn('lastName', !r.lastName.trim())} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label="Post-nom et prénom" value={r.firstName} onChange={(e) => set(r.key, { firstName: e.target.value })} className={warn('firstName', !r.firstName.trim())} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select aria-label="Sexe" value={r.gender} onChange={(e) => set(r.key, { gender: e.target.value as 'M' | 'F' | '' })} className={warn('gender', r.gender === '')}>
                      <option value="">—</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label="Date de naissance" type="date" value={r.birthDate} onChange={(e) => set(r.key, { birthDate: e.target.value })} className={warn('birthDate', false)} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select aria-label="Classe" value={r.classId} onChange={(e) => set(r.key, { classId: e.target.value })} className={warn('className', !r.classId)}>
                      <option value="">{r.className ? `« ${r.className} » ?` : 'Choisir…'}</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label="Parent" value={r.parentName} onChange={(e) => set(r.key, { parentName: e.target.value })} className={warn('parentName', false)} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label="Téléphone" type="tel" value={r.parentPhone} placeholder="Illisible" onChange={(e) => set(r.key, { parentPhone: e.target.value })} className={warn('parentPhone', !isValidPhone(r.parentPhone))} />
                  </td>
                  <td className="truncate py-1.5 text-[13px]" title={r.duplicate ? `Déjà inscrit · ${r.duplicate.matricule}` : pb.join(', ') || 'Prêt'}>
                    {r.duplicate ? (
                      <span>Déjà inscrit · {r.duplicate.matricule}</span>
                    ) : pb.length ? (
                      <span className="font-semibold text-warn">{pb[0]}</span>
                    ) : (
                      <span className="text-ink-3">Prêt</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {failed.length > 0 && (
        <div className="mt-3">
          <ErrorNote>
            {failed.length} inscription{failed.length > 1 ? 's' : ''} n'ont pas abouti : {failed.slice(0, 3).join(' ; ')}
          </ErrorNote>
        </div>
      )}
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface py-3">
        <span className="text-sm text-ink-2">
          <strong className="font-semibold tabular-nums">{ready.length}</strong> prêt{ready.length > 1 ? 's' : ''}
          {toFix.length > 0 && <span className="font-semibold text-warn"> · {toFix.length} à corriger</span>}
          {dups.length > 0 && ` · ${dups.length} déjà inscrit${dups.length > 1 ? 's' : ''}`}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={progress !== null}>
            Annuler
          </Button>
          <Button onClick={() => void add()} loading={progress !== null} disabled={!ready.length}>
            {progress !== null ? `Inscription ${progress}/${ready.length}…` : `Inscrire ${ready.length} élève${ready.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Classes et branches ────────────────────────────────────────────────────

type ClassRow = AiClass & { key: string; include: boolean; existingId: string };

function ClassesReview({ data, doc, onCancel }: { data: AiResults['classes']; doc: PreparedDocument; onCancel: () => void }) {
  const { db } = getFirebase();
  const toast = useToast();
  const { schoolId, classes } = useSchool();
  const [rows, setRows] = useState<ClassRow[]>(() =>
    data.classes.map((c, i) => ({
      ...c,
      level: LEVELS.includes(c.level) ? c.level : 'Autre',
      key: String(i),
      include: true,
      existingId: classes.find((x) => norm(x.name) === norm(c.name))?.id ?? '',
    })),
  );
  const [busy, setBusy] = useState(false);
  const set = (key: string, patch: Partial<ClassRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setSubject = (key: string, i: number, patch: Partial<AiClass['subjects'][number]>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, subjects: r.subjects.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : r)));
  const chosen = rows.filter((r) => r.include && r.name.trim());

  async function save() {
    setBusy(true);
    try {
      for (const r of chosen) {
        const subjects: Subject[] = r.subjects
          .filter((s) => s.name.trim() && s.max > 0)
          .map((s) => ({ id: newId(), name: s.name.trim(), max: s.max, examMax: s.examMax > 0 ? s.examMax : undefined }));
        if (r.existingId) await saveSubjects(db, schoolId, r.existingId, subjects);
        else await saveClass(db, { schoolId, name: r.name.trim(), level: r.level, titulaireEmail: '', titulaireName: '', subjects });
      }
      toast(`${chosen.length} classe${chosen.length > 1 ? 's' : ''} enregistrée${chosen.length > 1 ? 's' : ''}.`);
      navigate('classes');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FileBar doc={doc} onCancel={onCancel} />
      {data.remark && <p className="mb-3 text-sm text-ink-2">Remarque de Gemini : {data.remark}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <section key={r.key} className={cx('rounded-[14px] border border-line p-4', !r.include && 'opacity-60')}>
            <div className="flex flex-wrap items-end gap-3">
              <Checkbox label="" aria-label={`Retenir ${r.name}`} checked={r.include} onChange={(e) => set(r.key, { include: e.target.checked })} className="min-h-0 py-0" />
              <Field label="Classe" value={r.name} onChange={(e) => set(r.key, { name: e.target.value, existingId: classes.find((x) => norm(x.name) === norm(e.target.value))?.id ?? '' })} wrapperClassName="flex-1" className="h-10" />
              <SelectField label="Niveau" value={r.level} onChange={(e) => set(r.key, { level: e.target.value })} className="h-10" disabled={!!r.existingId}>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </SelectField>
            </div>
            {r.existingId && <p className="mt-2 text-[13px] text-warn">Cette classe existe déjà : ses branches seront remplacées.</p>}
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="py-1 font-semibold">Branche</th>
                  <th className="w-20 py-1 font-semibold">Période</th>
                  <th className="w-20 py-1 font-semibold">Examen</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {r.subjects.map((s, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-2">
                      <input aria-label="Branche" value={s.name} onChange={(e) => setSubject(r.key, i, { name: e.target.value })} className={cx(cell, 'border-transparent hover:border-field')} />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input aria-label="Maximum par période" inputMode="decimal" value={s.max || ''} onChange={(e) => setSubject(r.key, i, { max: Number(e.target.value.replace(',', '.')) || 0 })} className={cx(cell, s.max > 0 ? 'border-transparent hover:border-field' : 'border-[#e3b25c] bg-warn-soft')} />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input aria-label="Maximum à l'examen" inputMode="decimal" value={s.examMax || ''} placeholder={String((s.max || 0) * 2)} onChange={(e) => setSubject(r.key, i, { examMax: Number(e.target.value.replace(',', '.')) || 0 })} className={cx(cell, 'border-transparent hover:border-field')} />
                    </td>
                    <td>
                      <IconButton label={`Retirer ${s.name}`} onClick={() => set(r.key, { subjects: r.subjects.filter((_, j) => j !== i) })} className="size-9 text-ink-3">
                        <Trash2 size={16} aria-hidden="true" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[13px] text-ink-3">
              {r.subjects.length} branches · {r.subjects.reduce((a, s) => a + (s.max || 0), 0)} points par période
            </p>
          </section>
        ))}
      </div>
      <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-line bg-surface py-3">
        <Button variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
        <Button onClick={() => void save()} loading={busy} disabled={!chosen.length}>
          Enregistrer {chosen.length} classe{chosen.length > 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}

// ── Horaire ────────────────────────────────────────────────────────────────

function TimetableReview({ data, doc, onCancel }: { data: AiResults['timetable']; doc: PreparedDocument; onCancel: () => void }) {
  const { db } = getFirebase();
  const toast = useToast();
  const access = useAccess();
  const { schoolId, classes, school } = useSchool();
  const timetables = useLiveQuery<Timetable>(`timetables:${schoolId}`, () => q.timetables(db, schoolId));
  const [classId, setClassId] = useState('');
  const [slots, setSlots] = useState<AiSlot[]>(() => [...data.slots].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)));
  const [busy, setBusy] = useState(false);
  const days: Weekday[] = school?.saturdayClasses ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const existing = timetables.data.find((t) => t.classId === classId && t.slots.length);
  const set = (i: number, patch: Partial<AiSlot>) => setSlots((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const valid = (s: AiSlot) => s.subject.trim() && /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end) && s.end > s.start && s.day >= 1 && s.day <= 6;

  async function save() {
    setBusy(true);
    try {
      const clean: TimetableSlot[] = slots.filter(valid).map((s) => ({
        day: s.day as Weekday,
        start: s.start,
        end: s.end,
        subject: s.subject.trim(),
        teacher: s.teacher.trim() || undefined,
        room: s.room.trim() || undefined,
      }));
      await saveTimetable(db, { schoolId, classId, slots: clean, updatedBy: access.email });
      toast(`Horaire enregistré : ${clean.length} cours.`);
      navigate('horaire');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FileBar doc={doc} onCancel={onCancel}>
        <select aria-label="Classe" value={classId} onChange={(e) => setClassId(e.target.value)} className={cx('h-9 rounded-lg border bg-surface px-2 text-sm', classId ? 'border-field' : 'border-[#e3b25c] bg-warn-soft')}>
          <option value="">Classe de cet horaire…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FileBar>
      {data.remark && <p className="mb-3 text-sm text-ink-2">Remarque de Gemini : {data.remark}</p>}
      {existing && <p className="mb-3 text-sm text-warn">Cette classe a déjà un horaire de {existing.slots.length} cours : il sera remplacé.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-xs text-ink-3">
              <th className="py-2 pr-2 font-semibold">Jour</th>
              <th className="py-2 pr-2 font-semibold">Début</th>
              <th className="py-2 pr-2 font-semibold">Fin</th>
              <th className="py-2 pr-2 font-semibold">Cours</th>
              <th className="py-2 pr-2 font-semibold">Enseignant</th>
              <th className="py-2 pr-2 font-semibold">Salle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => (
              <tr key={i} className={cx('border-t border-line-soft', !valid(s) && 'bg-warn-soft/60')}>
                <td className="py-1 pr-2">
                  <select aria-label="Jour" value={s.day} onChange={(e) => set(i, { day: Number(e.target.value) })} className={cx(cell, 'border-transparent hover:border-field')}>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Début" type="time" value={s.start} onChange={(e) => set(i, { start: e.target.value })} className={cx(cell, 'border-transparent hover:border-field')} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Fin" type="time" value={s.end} onChange={(e) => set(i, { end: e.target.value })} className={cx(cell, 'border-transparent hover:border-field')} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Cours" value={s.subject} onChange={(e) => set(i, { subject: e.target.value })} className={cx(cell, 'border-transparent hover:border-field')} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Enseignant" value={s.teacher} onChange={(e) => set(i, { teacher: e.target.value })} className={cx(cell, 'border-transparent hover:border-field')} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Salle" value={s.room} onChange={(e) => set(i, { room: e.target.value })} className={cx(cell, 'border-transparent hover:border-field')} />
                </td>
                <td>
                  <IconButton label="Retirer ce cours" onClick={() => setSlots((ss) => ss.filter((_, j) => j !== i))} className="size-9 text-ink-3">
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface py-3">
        <span className="text-sm text-ink-2">{slots.filter(valid).length} cours valides sur {slots.length}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!classId || !slots.some(valid)}>
            Enregistrer l'horaire
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Interrogation ──────────────────────────────────────────────────────────

function QuizReview({ data, doc, classId, subject, onCancel }: { data: AiResults['quiz']; doc: PreparedDocument; classId: string; subject: string; onCancel: () => void }) {
  const { db } = getFirebase();
  const toast = useToast();
  const access = useAccess();
  const { schoolId, myClasses, school } = useSchool();
  const cls = myClasses.find((c) => c.id === classId);
  const [title, setTitle] = useState(data.title);
  const [questions, setQuestions] = useState<AiQuestion[]>(data.questions);
  const [withAnswers, setWithAnswers] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const total = useMemo(() => questions.reduce((a, x) => a + (x.points || 0), 0), [questions]);
  const set = (i: number, patch: Partial<AiQuestion>) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function publish() {
    if (!cls || !dueDate) return;
    setBusy(true);
    try {
      await addHomework(db, {
        schoolId,
        classId: cls.id,
        className: cls.name,
        subject: subject || 'Interrogation',
        title: title.trim(),
        description: questions.map((x, i) => `${i + 1}. ${x.question}`).join('\n'),
        dueDate,
        teacherName: access.name,
        createdBy: access.email,
      });
      toast('Publié comme devoir : les parents sont prévenus.');
      navigate('devoirs');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FileBar doc={doc} onCancel={onCancel} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="self-end pb-3 text-sm text-ink-3">
          {cls?.name} · {subject || 'branche non précisée'} · total {total} points
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-3">
        {questions.map((x, i) => (
          <li key={i} className="rounded-[14px] border border-line p-3">
            <div className="flex items-start gap-3">
              <span className="mt-2 w-6 text-sm font-semibold text-ink-3">{i + 1}.</span>
              <div className="grid flex-1 gap-2">
                <textarea aria-label={`Question ${i + 1}`} value={x.question} rows={2} onChange={(e) => set(i, { question: e.target.value })} className="w-full rounded-lg border border-transparent px-2.5 py-1.5 text-[15px] hover:border-field focus:border-brand focus:outline-none" />
                <textarea aria-label={`Réponse attendue ${i + 1}`} value={x.answer} rows={1} onChange={(e) => set(i, { answer: e.target.value })} className="w-full rounded-lg border border-transparent bg-ground px-2.5 py-1.5 text-sm text-ink-2 hover:border-field focus:border-brand focus:outline-none" />
              </div>
              <input aria-label="Points" inputMode="decimal" value={x.points || ''} onChange={(e) => set(i, { points: Number(e.target.value.replace(',', '.')) || 0 })} className="h-9 w-14 rounded-lg border border-field text-center text-sm" />
              <IconButton label="Retirer la question" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="size-9 text-ink-3">
                <Trash2 size={16} aria-hidden="true" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>

      <div className="print-area hidden print:block">
        <div style={{ fontFamily: 'serif', fontSize: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{school?.name}</strong>
            <span>
              {cls?.name} · {subject}
            </span>
          </div>
          <h2 style={{ textAlign: 'center', margin: '16px 0' }}>{title}</h2>
          <p>Nom : ……………………………………… Date : {todayISO().split('-').reverse().join('/')} · Total : /{total}</p>
          <ol>
            {questions.map((x, i) => (
              <li key={i} style={{ marginBottom: withAnswers ? 6 : 36 }}>
                {x.question} <em>({x.points} pt{x.points > 1 ? 's' : ''})</em>
                {withAnswers && <div style={{ color: '#444' }}>Réponse : {x.answer}</div>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line bg-surface py-3">
        <Checkbox label="Imprimer avec les réponses" checked={withAnswers} onChange={(e) => setWithAnswers(e.target.checked)} />
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
            Imprimer
          </Button>
          <Field label="À rendre le" type="date" value={dueDate} min={todayISO()} onChange={(e) => setDueDate(e.target.value)} className="h-10" />
          <Button onClick={() => void publish()} loading={busy} disabled={!dueDate || !questions.length}>
            Publier comme devoir
          </Button>
        </div>
      </div>
    </div>
  );
}

