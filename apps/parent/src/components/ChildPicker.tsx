import { initials, Modal, cx } from '@pe/shared/ui';
import { useState, type ReactNode } from 'react';
import type { Nav } from '../nav';
import { useParentData, type Child } from '../data';
import { Icon } from './Icon';

/** Initiales de l'enfant dans une pastille neutre. */
export function Avatar({ child, size = 38 }: { child: Child; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(child.student.firstName, child.student.lastName)}
    </span>
  );
}

const hasDanger = (c: Child) => c.finance.alerts[0]?.level === 'danger';

/** Choix de l'enfant affiché (accueil) : contrôle segmenté. */
export function ChildChips({ nav }: { nav: Nav }) {
  const { children, active, setActiveId } = useParentData();
  return (
    <div role="group" aria-label="Enfant affiché" className="mx-5 flex gap-1 rounded-xl bg-muted p-1">
      {children.map((c) => {
        const selected = c.id === active?.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setActiveId(c.id)}
            className={cx(
              'relative h-9 min-w-0 flex-1 truncate rounded-[9px] px-2 text-sm',
              selected ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(17_22_19/8%)]' : 'font-medium text-ink-3',
            )}
          >
            {c.student.firstName}
            {!selected && hasDanger(c) && <span className="absolute top-1.5 right-2 size-2 rounded-full bg-danger" aria-label="Alerte" />}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Lier un autre enfant"
        onClick={() => nav.push({ name: 'add-child' })}
        className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[9px] text-ink-3"
      >
        <Icon name="plus" size={18} />
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
        className="relative flex h-9 shrink-0 items-center gap-1 rounded-full border border-field bg-surface pr-2.5 pl-3 text-ink"
        aria-label={`Enfant affiché : ${active.student.firstName}. Changer`}
      >
        <span className="text-sm font-semibold">{active.student.firstName}</span>
        <Icon name="caret-down" size={16} className="text-ink-3" />
        {others.some(hasDanger) && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-danger" />}
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
                className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left', c.id === active.id ? 'border-brand' : 'border-line')}
              >
                <Avatar child={c} size={42} />
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-semibold">
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
              className="flex min-h-12 w-full items-center gap-3 rounded-xl p-3 font-semibold text-brand"
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
    <header className="flex items-center gap-3 px-5 pt-safe-6 pb-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {right ?? <ChildSwitch nav={nav} />}
    </header>
  );
}

/** En-tête d'un écran empilé : bouton retour, titre, action à droite. */
export function SubHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-1.5 px-2 pt-safe-4 pb-2">
      <button type="button" onClick={onBack} aria-label="Retour" className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-muted">
        <Icon name="caret-left" size={24} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
