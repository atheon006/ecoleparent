import { todayISO } from '@pe/shared';
import { useAuth } from '@pe/shared/auth';
import { Avatar } from '../components/ChildPicker';
import { Icon } from '../components/Icon';
import { CountBadge, List, Pill, Row, Section, Tile } from '../components/kit';
import { useParentData } from '../data';
import { conductPoints, nameInitials } from '../helpers';
import { nativeGoogleSignOut } from '../native';
import type { Nav } from '../nav';

export function MoreScreen({ nav }: { nav: Nav }) {
  const { user, signOut } = useAuth();
  const { children, active, setActiveId } = useParentData();
  if (!active) return null;
  const today = todayISO();
  const toSign = active.permissions.filter((p) => !active.permissionAnswers.has(p.id) && p.deadline >= today).length;
  const upcomingMeetings = active.events.filter((e) => e.rsvp && e.date >= today && !active.rsvps.has(e.id)).length;
  const openSlots = active.slots.filter((s) => s.status === 'open' && s.date >= today).length;
  const pendingRequests = active.requests.filter((r) => r.status === 'pending').length;
  const points = active.conduct.reduce((a, c) => a + conductPoints(c), 0);

  return (
    <div>
      <header className="px-[18px] pt-safe-5 pb-2.5">
        <h1 className="font-display text-[28px] leading-[1.05] font-extrabold tracking-tight">Plus</h1>
      </header>
      <button type="button" onClick={() => nav.push({ name: 'account' })} className="pe-card mx-4 flex w-[calc(100%-2rem)] items-center gap-3.5 p-4 text-left">
        <span className="tone-a flex size-14 shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold">{nameInitials(user?.displayName || user?.email || 'P')}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-extrabold">{user?.displayName || 'Mon compte'}</span>
          <span className="block truncate text-[13px] text-ink-3">{user?.email}</span>
        </span>
        <Icon name="caret-right" size={18} className="text-ink-3" />
      </button>

      <Section title="Mes enfants" />
      <List>
        {children.map((c) => (
          <Row
            key={c.id}
            left={<Avatar child={c} size={42} />}
            title={`${c.student.firstName} ${c.student.lastName}`}
            sub={`${c.student.className} · ${c.school?.name ?? ''}`}
            end={c.id === active.id ? <Pill tone="ok">Affiché</Pill> : undefined}
            onClick={() => {
              setActiveId(c.id);
              nav.push({ name: 'child' });
            }}
          />
        ))}
        <Row left={<Tile icon="user-plus" tone="g" />} title="Lier un autre enfant" onClick={() => nav.push({ name: 'add-child' })} />
      </List>

      <Section title="Vie scolaire" />
      <List>
        <Row left={<Tile icon="calendar-blank" tone="c" />} title="Agenda scolaire" sub="Réunions, congés, examens, jours fériés" onClick={() => nav.push({ name: 'agenda' })} />
        <Row left={<Tile icon="certificate" tone="a" />} title="Bulletins" sub={active.bulletins.length ? `${active.bulletins.length} publié${active.bulletins.length > 1 ? 's' : ''}` : 'Aucun pour l’instant'} onClick={() => nav.push({ name: 'bulletins' })} />
        <Row left={<Tile icon="folder-simple" tone="b" />} title="Documents" sub="Reçus, attestations, règlement" end={<CountBadge n={pendingRequests} />} onClick={() => nav.push({ name: 'documents' })} />
        <Row left={<Tile icon="star" tone="a" />} title="Conduite" sub={active.conduct.length ? `${points > 0 ? '+' : ''}${points} point${Math.abs(points) > 1 ? 's' : ''}` : 'Points positifs et remarques'} onClick={() => nav.push({ name: 'conduct' })} />
        <Row
          left={<Tile icon="handshake" tone="g" />}
          title="Réunions et rendez-vous"
          sub={openSlots ? `${openSlots} créneau${openSlots > 1 ? 'x' : ''} proposé${openSlots > 1 ? 's' : ''}` : undefined}
          end={<CountBadge n={upcomingMeetings} />}
          onClick={() => nav.push({ name: 'meetings' })}
        />
        <Row left={<Tile icon="signature" tone="t" />} title="Autorisations" sub={toSign ? `${toSign} à signer` : 'Tout est signé'} end={<CountBadge n={toSign} />} onClick={() => nav.push({ name: 'permissions' })} />
        <Row left={<Tile icon="buildings" tone="v" />} title="L'école" sub={active.school?.name} onClick={() => nav.push({ name: 'school-info' })} />
      </List>

      <Section title="Application" />
      <List>
        <Row left={<Tile icon="gear-six" tone="g" />} title="Paramètres" sub="Notifications, apparence, sécurité" onClick={() => nav.push({ name: 'settings' })} />
        <Row left={<Tile icon="question" tone="b" />} title="Aide et contact" onClick={() => nav.push({ name: 'help' })} />
        <Row
          left={<Tile icon="sign-out" tone="c" />}
          title="Se déconnecter"
          chevron={false}
          onClick={async () => {
            await nativeGoogleSignOut();
            await signOut();
          }}
        />
      </List>
      <p className="mt-5 text-center text-xs text-ink-3">ParentEcole · version {__APP_VERSION__}</p>
    </div>
  );
}
