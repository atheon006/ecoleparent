import { formatFull, formatPercent, ordinal } from '@pe/shared';
import { cx, useToast } from '@pe/shared/ui';
import { SubHeader } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { Btn, EmptyState, List, Note, Pill, Row, Section, Tile, percentColor } from '../components/kit';
import { useParentData } from '../data';
import { fmtNum } from '../helpers';
import { isNative, shareText } from '../native';
import type { Nav } from '../nav';

export function BulletinsScreen({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  if (!active) return null;
  const list = active.bulletins;
  const years = [...new Set(list.map((b) => b.year))];
  return (
    <div>
      <SubHeader title="Bulletins" subtitle={`${active.student.firstName} ${active.student.lastName}`} onBack={nav.back} />
      {list.length === 0 ? (
        <EmptyState icon="certificate" title="Aucun bulletin pour l'instant">
          Les bulletins apparaissent ici dès que l'école les publie, à la fin de chaque période.
        </EmptyState>
      ) : (
        years.map((y) => (
          <div key={y}>
            <Section title={`Année ${y}`} />
            <List>
              {list
                .filter((b) => b.year === y)
                .map((b) => (
                  <Row
                    key={b.id}
                    left={<Tile icon="certificate" tone="g" />}
                    title={b.periodLabel}
                    sub={`${b.className} · ${fmtNum(b.percent)} %${b.rank ? ` · ${ordinal(b.rank)} sur ${b.classSize}` : ''}`}
                    onClick={() => nav.push({ name: 'bulletin', id: b.id })}
                  />
                ))}
            </List>
          </div>
        ))
      )}
      <Note icon="shield-check">Chaque bulletin est publié par la direction de l'école. Vous pouvez le partager ou l'imprimer.</Note>
    </div>
  );
}

export function BulletinScreen({ nav, id }: { nav: Nav; id: string }) {
  const { active } = useParentData();
  const toast = useToast();
  const b = active?.bulletins.find((x) => x.id === id);
  if (!active || !b) {
    return (
      <div>
        <SubHeader title="Bulletin" onBack={nav.back} />
        <EmptyState icon="certificate" title="Bulletin introuvable" />
      </div>
    );
  }
  const school = active.school;

  async function share() {
    const lines = [
      `Bulletin de ${b!.studentName} — ${b!.periodLabel} ${b!.year}`,
      `${school?.name ?? ''} · ${b!.className}`,
      '',
      ...b!.lines.map((l) => `${l.subject} : ${l.points === null ? '—' : fmtNum(l.points)} / ${fmtNum(l.max)}`),
      '',
      `Total : ${fmtNum(b!.totalPoints)} / ${fmtNum(b!.totalMax)} · ${formatPercent(b!.percent)}`,
      b!.rank ? `Place : ${ordinal(b!.rank)} sur ${b!.classSize}` : '',
      b!.application ? `Application : ${b!.application}` : '',
      b!.conduct ? `Conduite : ${b!.conduct}` : '',
      b!.decision ? `Décision : ${b!.decision}` : '',
    ].filter((x, i, arr) => x !== '' || arr[i - 1] !== '');
    try {
      if ((await shareText(`Bulletin ${b!.periodLabel}`, lines.join('\n'))) === 'copied') toast('Bulletin copié.');
    } catch {
      /* partage annulé */
    }
  }

  return (
    <div>
      <SubHeader
        title="Bulletin"
        subtitle={`${b.periodLabel} ${b.year}`}
        onBack={nav.back}
        right={
          <button type="button" onClick={() => void share()} aria-label="Partager" className="flex size-[42px] items-center justify-center rounded-full border border-line bg-surface">
            <Icon name="share-network" size={22} />
          </button>
        }
      />
      <div className="print-area">
        <div className="pe-card mx-4 p-4">
          <div className="flex items-center gap-3">
            {school?.logo ? <img src={school.logo} alt="" className="size-[42px] rounded-xl object-contain" /> : <Tile icon="certificate" tone="g" />}
            <div className="min-w-0">
              <div className="font-semibold">
                {b.studentName} · {b.periodLabel}
              </div>
              <div className="text-[12.5px] text-ink-3">
                {school?.name} · {b.className}
              </div>
            </div>
          </div>
          <div className="my-3 h-px bg-line-soft" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={`${fmtNum(b.percent)} %`} label="Pourcentage" className={percentColor(b.percent)} />
            <Stat value={b.rank ? ordinal(b.rank) : '—'} label={`Place sur ${b.classSize}`} />
            <Stat value={fmtNum(b.totalPoints)} label={`Points sur ${fmtNum(b.totalMax)}`} />
          </div>
        </div>

        <Section title="Résultats par branche" />
        <div className="pe-card mx-4 px-4 pt-1.5 pb-3">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-3 uppercase">
                <th className="py-2 font-semibold">Branche</th>
                <th className="py-2 text-right font-semibold">Max.</th>
                <th className="py-2 text-right font-semibold">Points</th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.subjectId} className="border-b border-line-soft">
                  <td className="py-2">{l.subject}</td>
                  <td className="py-2 text-right text-ink-3">{fmtNum(l.max)}</td>
                  <td className={cx('py-2 text-right font-semibold', l.points !== null && l.points < l.max / 2 && 'text-danger')}>{l.points === null ? '—' : fmtNum(l.points)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-3">Total</td>
                <td className="pt-3 text-right">{fmtNum(b.totalMax)}</td>
                <td className="pt-3 text-right">{fmtNum(b.totalPoints)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <Section title="Appréciations" />
        <List>
          <Row left={<Tile icon="star" tone="a" />} title="Application" end={b.application ? <Pill tone="ok">{b.application}</Pill> : <Pill>—</Pill>} />
          <Row left={<Tile icon="smiley" tone="t" />} title="Conduite" end={b.conduct ? <Pill tone="ok">{b.conduct}</Pill> : <Pill>—</Pill>} />
          {b.decision && <Row left={<Tile icon="seal-check" tone="g" />} title="Décision" sub={b.decision} />}
          {b.appreciation && <Row left={<Tile icon="chalkboard-teacher" tone="b" />} title="Mot du titulaire" sub={`« ${b.appreciation} »`} />}
        </List>
        <p className="mx-5 mt-3 text-xs text-ink-3">
          Publié le {formatFull(b.publishedAt.slice(0, 10))} par {b.publishedBy}.
        </p>
      </div>
      <div className="mx-4 mt-3.5 grid grid-cols-2 gap-2.5">
        <Btn variant="ghost" icon="share-network" onClick={() => void share()}>
          Partager
        </Btn>
        {!isNative && (
          <Btn icon="download-simple" onClick={() => window.print()}>
            Imprimer
          </Btn>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div>
      <div className={cx('text-2xl font-semibold tabular-nums', className)}>{value}</div>
      <div className="text-[11.5px] text-ink-3">{label}</div>
    </div>
  );
}
