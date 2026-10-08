import { initials, Modal, cx } from '@pe/shared/ui';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Nav } from '../App';
import { useParentData, type Child } from '../data';

export function Avatar({ child, size = 38, active = true }: { child: Child; size?: number; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center rounded-full font-bold', active ? 'bg-chalk text-ink' : 'bg-brand-soft text-brand')}
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
    <div className="scrollbar-none flex gap-2 overflow-x-auto px-5 pt-2 pb-3.5">
      {children.map((c) => {
        const selected = c.id === active?.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setActiveId(c.id)}
            className={cx(
              'relative flex min-h-[52px] shrink-0 items-center gap-2.5 rounded-full border py-1.5 pr-3.5 pl-1.5',
              selected ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink',
            )}
          >
            <Avatar child={c} active={selected} />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[15px] font-bold">{c.student.firstName}</span>
              <span className={cx('text-xs', selected ? 'text-brand-ink' : 'text-ink-3')}>{c.student.className}</span>
            </span>
            {!selected && hasDanger(c) && (
              <span className="absolute top-1 left-9 size-2.5 rounded-full border-2 border-white bg-danger">
                <span className="sr-only">Alerte</span>
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Ajouter un enfant"
        onClick={() => nav.open('add-child')}
        className="flex size-[52px] shrink-0 items-center justify-center rounded-full border border-dashed border-[#9aa79f] text-brand"
      >
        <Plus size={22} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Puce compacte (en-tête des autres onglets) qui ouvre la liste des enfants. */
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
        className="relative flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-ink"
        aria-label={`Enfant affiché : ${active.student.firstName}. Changer`}
      >
        <Avatar child={active} size={34} />
        <span className="text-sm font-bold">{active.student.firstName}</span>
        <ChevronDown size={16} aria-hidden="true" />
        {others.some(hasDanger) && <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full border-2 border-white bg-danger" />}
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
                <Avatar child={c} size={42} active={c.id === active.id} />
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-bold">
                    {c.student.firstName} {c.student.lastName}
                  </span>
                  <span className="text-[13px] text-ink-3">
                    {c.student.className} · {c.school?.name ?? ''}
                  </span>
                </span>
                {c.id === active.id && <Check size={20} className="text-brand" aria-label="Affiché" />}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                nav.open('add-child');
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-[#9aa79f] p-3 font-bold text-brand"
            >
              <Plus size={20} aria-hidden="true" /> Ajouter un enfant
            </button>
          </li>
        </ul>
      </Modal>
    </>
  );
}

export function ScreenHeader({ title, nav, subtitle }: { title: string; nav: Nav; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-safe-5 pb-3">
      <div className="flex min-w-0 flex-col">
        <h1 className="font-display text-[26px] font-bold">{title}</h1>
        {subtitle && <span className="truncate text-sm text-ink-3">{subtitle}</span>}
      </div>
      <ChildSwitch nav={nav} />
    </header>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between">
      <h2 className="font-display text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}
