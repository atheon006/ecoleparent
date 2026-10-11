import { formatShort, type EventCategory } from '@pe/shared';
import { useState } from 'react';
import { SubHeader } from '../components/ChildPicker';
import { Chips, DateBox, EmptyState, Note, Pill } from '../components/kit';
import { useParentData } from '../data';
import { agendaItems, yearOf, type AgendaItem } from '../helpers';
import type { Nav } from '../nav';
import { RsvpButtons } from './Home';

type Filter = 'all' | 'Réunion' | 'Examen' | 'Congé' | 'Activité' | 'Paiement' | 'holiday';

const TONE: Record<EventCategory, 'ok' | 'info' | 'warn' | 'bad'> = { Réunion: 'ok', Examen: 'info', Congé: 'warn', Activité: 'warn', Paiement: 'bad' };

export function AgendaScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  const [filter, setFilter] = useState<Filter>('all');
  if (!active) return null;
  const all = agendaItems(active);
  const matches = (i: AgendaItem) => filter === 'all' || (filter === 'holiday' ? i.kind === 'holiday' : i.kind === 'event' && i.event.category === filter);
  const list = all.filter(matches);
  const count = (f: Filter) => all.filter((i) => (f === 'holiday' ? i.kind === 'holiday' : i.kind === 'event' && i.event.category === f)).length;

  return (
    <div>
      <SubHeader title="Agenda scolaire" subtitle={`Année ${yearOf(active)}`} onBack={nav.back} />
      <Chips
        label="Filtrer"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Tout' },
          { value: 'Réunion', label: 'Réunions', count: count('Réunion') },
          { value: 'Examen', label: 'Examens', count: count('Examen') },
          { value: 'Congé', label: 'Congés', count: count('Congé') },
          { value: 'Activité', label: 'Sorties', count: count('Activité') },
          { value: 'Paiement', label: 'Paiements', count: count('Paiement') },
          { value: 'holiday', label: 'Jours fériés', count: count('holiday') },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon="calendar-blank" tone="c" title="Rien de prévu">
          Les réunions, examens et congés annoncés par l'école apparaîtront ici.
        </EmptyState>
      ) : (
        <div className="mt-2.5 flex flex-col gap-3">
          {list.map((i) =>
            i.kind === 'holiday' ? (
              <div key={`h-${i.date}`} className="pe-card mx-4 flex items-center gap-3.5 p-4">
                <DateBox date={i.date} tone="bad" />
                <div className="min-w-0 flex-1">
                  <Pill tone="bad" className="mb-1">
                    Jour férié
                  </Pill>
                  <div className="font-extrabold">{i.name}</div>
                  <div className="text-[13px] text-ink-3">Pas de cours</div>
                </div>
              </div>
            ) : (
              <div key={i.event.id} className="pe-card mx-4 flex items-start gap-3.5 p-4">
                <DateBox date={i.date} tone={TONE[i.event.category]} />
                <div className="min-w-0 flex-1">
                  <Pill className="mb-1">{i.event.category}</Pill>
                  <div className="font-extrabold">{i.event.title}</div>
                  <div className="text-[13px] text-ink-3">
                    {[i.endDate && i.endDate !== i.date ? `Jusqu'au ${formatShort(i.endDate)}` : null, i.event.time, i.event.place].filter(Boolean).join(' · ')}
                  </div>
                  {i.event.description && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{i.event.description}</p>}
                  {i.event.rsvp && (
                    <div className="mt-2.5">
                      <RsvpButtons child={active} event={i.event} />
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
      <Note icon="calendar-x">Les jours fériés légaux de la RDC figurent d'office. Un report décidé par l'école apparaît comme un congé.</Note>
    </div>
  );
}
