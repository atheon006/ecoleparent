// Navigation de l'app parent : cinq onglets, et des écrans qui s'empilent par-dessus
// (le bouton « retour » d'Android dépile).

export type Tab = 'home' | 'school' | 'news' | 'fees' | 'more';

/** Rubriques de l'onglet Scolarité. */
export type SchoolSeg = 'notes' | 'devoirs' | 'presences' | 'horaire';

export type Route =
  | { name: 'notifications' }
  | { name: 'account' }
  | { name: 'add-child' }
  | { name: 'bulletins' }
  | { name: 'bulletin'; id: string }
  | { name: 'receipt'; id: string }
  | { name: 'child' }
  | { name: 'agenda' }
  | { name: 'documents' }
  | { name: 'conduct' }
  | { name: 'meetings' }
  | { name: 'permissions' }
  | { name: 'school-info' }
  | { name: 'settings' }
  | { name: 'settings-notifs' }
  | { name: 'settings-appearance' }
  | { name: 'settings-security' }
  | { name: 'settings-data' }
  | { name: 'help' };

export interface Nav {
  tab: Tab;
  seg: SchoolSeg;
  /** Change d'onglet (et de rubrique de Scolarité) en fermant les écrans empilés. */
  go: (tab: Tab, seg?: SchoolSeg) => void;
  setSeg: (seg: SchoolSeg) => void;
  push: (route: Route) => void;
  back: () => void;
}

/** Onglet mis en avant pendant qu'un écran empilé est affiché. */
export const ROUTE_TAB: Record<Route['name'], Tab> = {
  notifications: 'home',
  account: 'more',
  'add-child': 'more',
  bulletins: 'school',
  bulletin: 'school',
  receipt: 'fees',
  child: 'more',
  agenda: 'more',
  documents: 'more',
  conduct: 'more',
  meetings: 'more',
  permissions: 'more',
  'school-info': 'more',
  settings: 'more',
  'settings-notifs': 'more',
  'settings-appearance': 'more',
  'settings-security': 'more',
  'settings-data': 'more',
  help: 'more',
};
