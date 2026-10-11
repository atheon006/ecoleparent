import { initials, Modal, cx } from '@pe/shared/ui';
import { useState, type ReactNode } from 'react';
import type { Nav } from '../nav';
import { useParentData, type Child } from '../data';
import { Icon } from './Icon';

const AVATAR_TONES = ['tone-a', 'tone-b', 'tone-t', 'tone-v', 'tone-c', 'tone-g'];

/** Initiales de l'enfant dans une pastille colorée (une couleur par enfant). */
export function Avatar({ child, size = 38 }: { child: Child; size?: number }) {
  const { children } = useParentData();
  const index = Math.max(0, children.findIndex((c) => c.id === child.id));
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center rounded-full font-display font-extrabold tracking-wide', AVATAR_TONES[index % AVATAR_TONES.length])}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(child.student.firstName, child.student.lastName)}
    </span>
  );
}

const hasDanger = (c: Child) => c.finance.alerts[0]?.level === 'danger';

/** Rangée de puces enfants (accueil). */
export function ChildChips({ nav }: { nav: Nav }) {
  const { children, active, setActiveId } = useParentData();
  return (
    <div role="group" aria-label="Mes enfants" className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3">
      {children.map((c) => {
        const selected = c.id === active?.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setActiveId(c.id)}
            className={cx(
              'relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full border bg-surface pr-3.5 pl-[5px] text-[13.5px] font-bold',
              selected ? 'border-brand ring-2 ring-brand/35' : 'border-line',
            )}
          >
            <Avatar child={c} size={34} />
            {c.student.firstName}
            {!selected && hasDanger(c) && <span className="absolute top-0.5 left-7 size-2.5 rounded-full border-2 border-surface bg-danger" aria-label="Alerte" />}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => nav.push({ name: 'add-child' })}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13.5px] font-semibold text-ink-3"
      >
        <Icon name="plus" size={18} /> Ajouter
      </button>
    </div>
  );
}

/** Puce compacte (en-tête des onglets) qui ouvre la liste des enfants. */
export function ChildSwitch({ nav }: { nav: Nav }) {
  const { children, active, setActiveId } = useParentData();
  const [open, setOpen] = useState(false);
  if (!active) return null;
  const others = children.filter((c) => c.id !== active.id);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1 text-ink"
        aria-label={`Enfant affiché : ${active.student.firstName}. Changer`}
      >
        <Avatar child={active} size={34} />
        <span className="text-sm font-bold">{active.student.firstName}</span>
        <Icon name="caret-down" size={16} />
        {others.some(hasDanger) && <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full border-2 border-surface bg-danger" />}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Mes enfants" sheet>
        <ul className="flex flex-col gap-2 pb-2">
          {children.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveId(c.id);
                  setOpen(false);
                }}
                className={cx('flex w-full items-center gap-3 rounded-2xl border p-3 text-left', c.id === active.id ? 'border-brand bg-brand-soft' : 'border-line')}
              >
                <Avatar child={c} size={42} />
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-bold">
                    {c.student.firstName} {c.student.lastName}
                  </span>
                  <span className="text-[13px] text-ink-3">
                    {c.student.className} · {c.school?.name ?? ''}
                  </span>
                </span>
                {c.id === active.id && <Icon name="check-circle" size={22} className="text-brand" label="Affiché" />}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                nav.push({ name: 'add-child' });
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-field p-3 font-bold text-brand"
            >
              <Icon name="user-plus" size={22} /> Lier un autre enfant
            </button>
          </li>
        </ul>
      </Modal>
    </>
  );
}

/** En-tête d'un onglet : grand titre, sous-titre et sélecteur d'enfant. */
export function RootHeader({ title, subtitle, nav, right }: { title: string; subtitle?: string; nav: Nav; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 px-[18px] pt-safe-5 pb-2.5">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[28px] leading-[1.05] font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-[13px] font-medium text-ink-3">{subtitle}</p>}
      </div>
      {right ?? <ChildSwitch nav={nav} />}
    </header>
  );
}

/** En-tête d'un écran empilé : bouton retour, titre, action à droite. */
export function SubHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 px-4 pt-safe-4 pb-2.5">
      <button type="button" onClick={onBack} aria-label="Retour" className="flex size-[42px] shrink-0 items-center justify-center rounded-full border border-line bg-surface">
        <Icon name="caret-left" size={22} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[19px] leading-tight font-extrabold">{title}</h1>
        {subtitle && <p className="truncate text-[13px] font-medium text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
