import { addDays, formatShort, todayISO } from '@pe/shared';
import { cx } from '@pe/shared/ui';
import { SubHeader } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { EmptyState, List, Note, Row, Section, Tile } from '../components/kit';
import { useParentData } from '../data';
import { conductPoints, yearOf } from '../helpers';
import type { Nav } from '../nav';

export function ConductScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  if (!active) return null;
  const start = `${yearOf(active).slice(0, 4)}-08-01`;
  const list = active.conduct.filter((c) => c.date >= start);
  const total = list.reduce((a, c) => a + conductPoints(c), 0);
  const weekStar = list.find((c) => c.type === 'Élève de la semaine' && c.date >= addDays(todayISO(), -7));
  const positives = list.filter((c) => conductPoints(c) > 0).length;

  return (
    <div>
      <SubHeader title="Conduite" subtitle={`${active.student.firstName} · année ${yearOf(active)}`} onBack={nav.back} />
      <div className="pe-summary mx-5 mt-2 px-[18px] py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] text-ink-3">Points de conduite</div>
            <div className="text-[36px] leading-tight font-semibold tracking-tight tabular-nums">
              {total > 0 ? '+' : ''}
              {total}
            </div>
            <div className="text-[13px] text-ink-3">
              {positives} encouragement{positives > 1 ? 's' : ''} depuis la rentrée
            </div>
          </div>
          <Icon name="trophy" size={30} className="text-ink-4" />
        </div>
        {weekStar && (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm font-semibold">
            <Icon name="medal" size={18} className="text-brand" /> Élève de la semaine
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState icon="star" title="Rien pour l'instant">
          Les félicitations et remarques des enseignants apparaîtront ici.
        </EmptyState>
      ) : (
        <>
          <Section title="Historique" />
          <List>
            {list.map((c) => {
              const p = conductPoints(c);
              return (
                <Row
                  key={c.id}
                  left={<Tile icon={p > 0 ? 'thumbs-up' : p < 0 ? 'warning-circle' : 'info'} tone={p > 0 ? 'g' : p < 0 ? 'c' : 'b'} />}
                  title={c.title}
                  sub={`${c.type} · ${formatShort(c.date)} · ${c.author}${c.comment ? ` · ${c.comment}` : ''}`}
                  end={<span className={cx('text-base font-semibold', p > 0 ? 'text-ok' : p < 0 ? 'text-danger' : 'text-ink-3')}>{p > 0 ? `+${p}` : p}</span>}
                />
              );
            })}
          </List>
        </>
      )}
      <Note icon="lightbulb">Les points encouragent les efforts. Ils ne comptent pas dans la moyenne.</Note>
    </div>
  );
}
