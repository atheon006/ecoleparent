import { useToast } from '@pe/shared/ui';
import { SubHeader } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { List, Pill, Row, Section, Tile } from '../components/kit';
import { useParentData } from '../data';
import { isNative } from '../native';
import type { Nav } from '../nav';
import { copy } from './SchoolInfo';

const SUPPORT_EMAIL = 'readykalonda38@gmail.com';

const FAQ: [string, string][] = [
  ['Comment lier un deuxième enfant ?', "Plus › Lier un autre enfant. Il vous faut le code élève remis par l'école et le numéro de téléphone donné à l'inscription."],
  ['Je ne reçois pas les notifications', 'Vérifiez Paramètres › Notifications, et que les notifications de ParentEcole sont autorisées dans les réglages du téléphone.'],
  ['Comment justifier une absence ?', "Scolarité › Présences, touchez l'absence dans la liste puis écrivez votre message. L'école l'accepte ou le refuse."],
  ['Où sont les bulletins ?', "Plus › Bulletins, ou Scolarité › Notes › Voir les bulletins. Ils apparaissent dès que la direction les publie."],
  ['Comment payer les frais ?', "À la caisse de l'école. Le reçu arrive automatiquement dans l'onglet Frais, où vous pouvez le partager."],
  ['Qui voit mes informations ?', "Uniquement vous et l'école de vos enfants. Aucune autre école ne peut les voir."],
  ["L'autre parent peut-il suivre l'enfant ?", "Oui, avec son propre compte : il lui suffit du code élève et de son numéro enregistré à l'école."],
];

export function Help({ nav }: { nav: Nav }) {
  const { active } = useParentData();
  const toast = useToast();
  const school = active?.school;
  return (
    <div>
      <SubHeader title="Aide et contact" onBack={nav.back} />
      <Section title="Questions fréquentes" />
      <div className="pe-card mx-4 overflow-hidden [&>*+*]:border-t [&>*+*]:border-line-soft">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 px-4 py-3.5 font-bold [&::-webkit-details-marker]:hidden">
              {q}
              <Icon name="caret-down" size={18} className="text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-3.5 text-[13.5px] leading-relaxed text-ink-2">{a}</p>
          </details>
        ))}
      </div>

      {school && (
        <>
          <Section title="Contacter l'école" />
          <List>
            {school.phone && (
              <a href={`tel:${school.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 px-4 py-3">
                <Tile icon="phone" tone="g" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{school.phone}</span>
                  <span className="block text-[13px] text-ink-3">{school.hours || 'Secrétariat'}</span>
                </span>
                <Pill tone="ok">Appeler</Pill>
              </a>
            )}
            {school.email && <Row left={<Tile icon="envelope-simple" tone="b" />} title={school.email} sub="E-mail de l'école" end={<Pill>Copier</Pill>} chevron={false} onClick={() => void copy(school.email!, toast, 'E-mail')} />}
            {!school.phone && !school.email && <Row left={<Tile icon="buildings" tone="v" />} title={school.name} sub={school.address || 'Coordonnées non renseignées'} />}
          </List>
        </>
      )}

      <Section title="Un souci avec l'application ?" />
      <List>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`ParentEcole ${__APP_VERSION__} : signalement`)}`} className="flex items-center gap-3 px-4 py-3">
          <Tile icon="warning-circle" tone="c" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Signaler un problème</span>
            <span className="block text-[13px] text-ink-3">Écrire à l'équipe ParentEcole</span>
          </span>
          <Icon name="caret-right" size={18} className="text-ink-3" />
        </a>
        <a href="https://parentecole.web.app/confidentialite.html" target={isNative ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-3 px-4 py-3">
          <Tile icon="shield-check" tone="g" />
          <span className="flex-1 text-[15px] font-bold">Politique de confidentialité</span>
          <Icon name="caret-right" size={18} className="text-ink-3" />
        </a>
      </List>
      <p className="mt-5 text-center text-xs text-ink-3">ParentEcole · version {__APP_VERSION__}</p>
    </div>
  );
}
