import { STAFF_ROLE_LABELS, type StaffRole } from '@pe/shared';
import { useAuth } from '@pe/shared/auth';
import { useOnline } from '@pe/shared/hooks';
import { cx, IconButton, Loading } from '@pe/shared/ui';
import {
  ArrowLeft,
  Award,
  Banknote,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileCheck,
  FileText,
  FolderOpen,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MonitorDown,
  Megaphone,
  Menu,
  Receipt,
  School,
  Settings,
  Signature,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAccess, useRole } from '../access';
import { useInstallPrompt } from '../install';
import { AnnouncementsPage } from '../pages/Announcements';
import { AppointmentsPage } from '../pages/Appointments';
import { BulletinsPage } from '../pages/Bulletins';
import { CashierPage } from '../pages/Cashier';
import { ClassesPage } from '../pages/Classes';
import { ConductPage } from '../pages/Conduct';
import { Dashboard } from '../pages/Dashboard';
import { DocumentsPage } from '../pages/Documents';
import { EventsPage } from '../pages/Events';
import { FeesPage } from '../pages/Fees';
import { GradesPage } from '../pages/Grades';
import { HomeworkPage } from '../pages/Homework';
import { JustificationsPage } from '../pages/Justifications';
import { PaymentsPage } from '../pages/Payments';
import { PermissionsPage } from '../pages/Permissions';
import { RecoveryPage } from '../pages/Recovery';
import { RequestsPage } from '../pages/Requests';
import { RollCallPage } from '../pages/RollCall';
import { SettingsPage } from '../pages/Settings';
import { StaffPage } from '../pages/Staff';
import { StudentsPage } from '../pages/Students';
import { TimetablePage } from '../pages/Timetable';
import { navigate, useRoute } from '../router';
import { useSchool } from '../school';
import { AccessError } from '../pages/SuperSchools';

interface NavItem {
  route: string;
  label: string;
  icon: LucideIcon;
  roles: StaffRole[];
  section: string;
  page: () => ReactNode;
}

const ALL: StaffRole[] = ['admin', 'surveillant', 'professeur', 'caissier'];

const NAV: NavItem[] = [
  { route: 'tableau', label: 'Tableau de bord', icon: LayoutDashboard, roles: ['admin'], section: 'Pilotage', page: () => <Dashboard /> },
  { route: 'eleves', label: 'Élèves', icon: Users, roles: ALL, section: 'Pilotage', page: () => <StudentsPage /> },
  { route: 'classes', label: 'Classes', icon: LayoutGrid, roles: ['admin'], section: 'Pilotage', page: () => <ClassesPage /> },
  { route: 'personnel', label: 'Personnel', icon: UserCog, roles: ['admin'], section: 'Pilotage', page: () => <StaffPage /> },
  { route: 'notes', label: 'Notes', icon: GraduationCap, roles: ['admin', 'professeur'], section: 'Scolarité', page: () => <GradesPage /> },
  { route: 'bulletins', label: 'Bulletins', icon: FileText, roles: ['admin'], section: 'Scolarité', page: () => <BulletinsPage /> },
  { route: 'devoirs', label: 'Devoirs', icon: BookOpen, roles: ['admin', 'professeur'], section: 'Scolarité', page: () => <HomeworkPage /> },
  { route: 'horaire', label: 'Horaire', icon: CalendarClock, roles: ['admin', 'surveillant', 'professeur'], section: 'Scolarité', page: () => <TimetablePage /> },
  { route: 'appel', label: 'Appel', icon: ClipboardCheck, roles: ['admin', 'surveillant', 'professeur'], section: 'Vie scolaire', page: () => <RollCallPage /> },
  { route: 'justifications', label: 'Justifications', icon: FileCheck, roles: ['admin', 'surveillant'], section: 'Vie scolaire', page: () => <JustificationsPage /> },
  { route: 'conduite', label: 'Conduite', icon: Award, roles: ['admin', 'surveillant', 'professeur'], section: 'Vie scolaire', page: () => <ConductPage /> },
  { route: 'demandes', label: 'Demandes des parents', icon: Inbox, roles: ['admin', 'surveillant'], section: 'Vie scolaire', page: () => <RequestsPage /> },
  { route: 'rendez-vous', label: 'Rendez-vous', icon: CalendarCheck, roles: ['admin', 'surveillant', 'professeur'], section: 'Vie scolaire', page: () => <AppointmentsPage /> },
  { route: 'caisse', label: 'Encaisser', icon: Banknote, roles: ['admin', 'caissier'], section: 'Finances', page: () => <CashierPage /> },
  { route: 'paiements', label: 'Paiements', icon: Receipt, roles: ['admin', 'caissier'], section: 'Finances', page: () => <PaymentsPage /> },
  { route: 'recouvrement', label: 'Recouvrement', icon: TriangleAlert, roles: ['admin', 'caissier'], section: 'Finances', page: () => <RecoveryPage /> },
  { route: 'frais', label: 'Frais scolaires', icon: Wallet, roles: ['admin'], section: 'Finances', page: () => <FeesPage /> },
  { route: 'communiques', label: 'Communiqués', icon: Megaphone, roles: ['admin'], section: 'Communication', page: () => <AnnouncementsPage /> },
  { route: 'agenda', label: 'Agenda', icon: CalendarDays, roles: ['admin'], section: 'Communication', page: () => <EventsPage /> },
  { route: 'autorisations', label: 'Autorisations de sortie', icon: Signature, roles: ['admin'], section: 'Communication', page: () => <PermissionsPage /> },
  { route: 'documents', label: 'Documents', icon: FolderOpen, roles: ['admin'], section: 'Communication', page: () => <DocumentsPage /> },
  { route: 'ecole', label: "Paramètres de l'école", icon: Settings, roles: ['admin'], section: 'Communication', page: () => <SettingsPage /> },
];

const HOME: Record<StaffRole, string> = { admin: 'tableau', surveillant: 'appel', professeur: 'devoirs', caissier: 'caisse' };

export function Shell({ onLeaveSchool }: { onLeaveSchool?: () => void }) {
  const role = useRole();
  const route = useRoute();
  const { school, loading, error } = useSchool();
  const { signOut } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const online = useOnline();
  const items = NAV.filter((n) => n.roles.includes(role));
  const current = items.find((n) => n.route === route);

  useEffect(() => {
    if (!current) navigate(HOME[role]);
  }, [current, role]);
  useEffect(() => setDrawer(false), [route]);

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 md:block">
        <Sidebar items={items} route={route} onLeaveSchool={onLeaveSchool} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 bg-ink/45 md:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-72 max-w-[85%]" onClick={(e) => e.stopPropagation()}>
            <Sidebar items={items} route={route} onLeaveSchool={onLeaveSchool} onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-ground/95 px-3 py-2 backdrop-blur md:hidden">
          <IconButton label="Menu" onClick={() => setDrawer(true)}>
            <Menu size={24} aria-hidden="true" />
          </IconButton>
          <span className="truncate font-display text-lg font-bold">{current?.label ?? ''}</span>
        </header>
        {!online && (
          <div className="bg-warn-soft px-4 py-2 text-center text-sm font-semibold text-warn">
            Hors connexion : vos saisies seront envoyées dès le retour du réseau.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
          {error ? <AccessError onSignOut={() => void signOut()} /> : loading || !school ? <Loading /> : current ? current.page() : null}
        </main>
      </div>
    </div>
  );
}

function Sidebar({ items, route, onLeaveSchool, onClose }: { items: NavItem[]; route: string; onLeaveSchool?: () => void; onClose?: () => void }) {
  const { signOut } = useAuth();
  const access = useAccess();
  const role = useRole();
  const { school } = useSchool();
  const install = useInstallPrompt();
  const sections = [...new Set(items.map((i) => i.section))];

  return (
    <nav aria-label="Menu principal" className="flex h-full flex-col overflow-y-auto bg-brand text-white">
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-chalk text-ink">
            <School size={22} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[17px] leading-tight font-bold">{school?.name ?? 'ParentEcole'}</span>
            <span className="text-xs text-brand-ink">{access.isSuper ? 'Super-administrateur' : STAFF_ROLE_LABELS[role]}</span>
          </div>
        </div>
        {onClose && (
          <IconButton label="Fermer le menu" onClick={onClose} className="text-white hover:bg-brand-2">
            <X size={22} aria-hidden="true" />
          </IconButton>
        )}
      </div>

      {onLeaveSchool && (
        <button type="button" onClick={onLeaveSchool} className="mx-3 mb-2 flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-brand-ink hover:bg-brand-2">
          <ArrowLeft size={16} aria-hidden="true" /> Toutes les écoles
        </button>
      )}

      <div className="flex flex-1 flex-col gap-4 px-3 pb-4">
        {sections.map((section) => (
          <div key={section} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1 text-[11px] font-bold tracking-wider text-brand-ink/80 uppercase">{section}</span>
            {items
              .filter((i) => i.section === section)
              .map(({ route: r, label, icon: Icon }) => (
                <a
                  key={r}
                  href={`#/${r}`}
                  aria-current={r === route ? 'page' : undefined}
                  className={cx(
                    'flex min-h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors',
                    r === route ? 'bg-chalk font-bold text-ink' : 'font-semibold text-white/90 hover:bg-brand-2',
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </a>
              ))}
          </div>
        ))}
      </div>

      {install && (
        <button
          type="button"
          onClick={() => void install()}
          className="mx-3 mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-brand-2 px-3 text-sm font-semibold text-white hover:bg-brand-2"
        >
          <MonitorDown size={18} aria-hidden="true" /> Installer sur cet ordinateur
        </button>
      )}

      <div className="border-t border-brand-2 px-5 py-4">
        <div className="truncate text-sm font-bold">{access.name}</div>
        <div className="truncate text-xs text-brand-ink">{access.email}</div>
        <button type="button" onClick={() => void signOut()} className="mt-3 flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-ink hover:text-white">
          <LogOut size={16} aria-hidden="true" /> Se déconnecter
        </button>
      </div>
    </nav>
  );
}
