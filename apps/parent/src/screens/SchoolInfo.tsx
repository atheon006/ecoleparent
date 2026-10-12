import { useToast } from '@pe/shared/ui';
import { SubHeader } from '../components/ChildPicker';
import { EmptyState, List, Note, Pill, Row, Section, Tile } from '../components/kit';
import { useParentData } from '../data';
import { nameInitials, yearOf } from '../helpers';
import type { Nav } from '../nav';

export async function copy(text: string, toast: ReturnType<typeof useToast>, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copié.`);
  } catch {
    toast(text);
  }
}

export function SchoolInfo({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  const toast = useToast();
  if (!active) return null;
  const s = active.school;
  if (!s) {
    return (
      <div>
        <SubHeader title="L'école" onBack={nav.back} />
        <EmptyState icon="buildings" title="Informations indisponibles" />
      </div>
    );
  }
  const tel = s.phone?.replace(/\s/g, '');
  return (
    <div>
      <SubHeader title="L'école" onBack={nav.back} />
      <div className="flex flex-col items-center px-4 pt-1 pb-3 text-center">
        <span className="flex size-[76px] items-center justify-center overflow-hidden rounded-[22px] bg-brand-soft text-[26px] font-semibold text-brand">
          {s.logo ? <img src={s.logo} alt={`Logo de ${s.name}`} className="size-full bg-white object-contain" /> : nameInitials(s.name)}
        </span>
        <div className="mt-2 text-[21px] font-semibold">{s.name}</div>
        {s.directorName && <div className="text-ink-3">Chef d'établissement : {s.directorName}</div>}
      </div>
      <List>
        {s.address && <Row left={<Tile icon="map-pin" />} title="Adresse" sub={s.address} />}
        {s.hours && <Row left={<Tile icon="clock" tone="b" />} title="Horaires du secrétariat" sub={s.hours} />}
        {s.phone && (
          <a href={`tel:${tel}`} className="flex items-center gap-3 px-4 py-3">
            <Tile icon="phone" tone="g" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Téléphone</span>
              <span className="block text-[13px] text-ink-3">{s.phone}</span>
            </span>
            <Pill tone="ok">Appeler</Pill>
          </a>
        )}
        {s.email && (
          <Row left={<Tile icon="envelope-simple" tone="v" />} title="E-mail" sub={s.email} end={<Pill>Copier</Pill>} chevron={false} onClick={() => void copy(s.email!, toast, 'E-mail')} />
        )}
        <Row left={<Tile icon="calendar-blank" tone="t" />} title="Année scolaire" sub={`${yearOf(active)}${s.saturdayClasses ? ' · cours le samedi' : ''}`} />
      </List>
      {active.classRoom && (
        <>
          <Section title="Classe" />
          <List>
            <Row left={<Tile icon="users-three" tone="a" />} title={active.classRoom.name} sub={active.classRoom.titulaireName ? `Titulaire : ${active.classRoom.titulaireName}` : active.classRoom.level} />
            {!!active.classRoom.subjects?.length && (
              <Row left={<Tile icon="book-open-text" tone="g" />} title="Branches" sub={active.classRoom.subjects.map((x) => x.name).join(', ')} />
            )}
          </List>
        </>
      )}
      <Note icon="shield-check">Seule l'école de vos enfants voit vos informations. Aucune autre école n'y a accès.</Note>
    </div>
  );
}
