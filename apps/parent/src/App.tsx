import { todayISO } from '@pe/shared';
import { addFcmToken, saveDevice, saveUserProfile } from '@pe/shared/api';
import { AuthProvider, useAuth } from '@pe/shared/auth';
import { MfaChallenge } from '@pe/shared/mfa';
import { getFirebase, isFirebaseConfigured } from '@pe/shared/firebase';
import { Button, Loading, ToastProvider, cx } from '@pe/shared/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomNav, SideNav, type Badges } from './components/BottomNav';
import { LockScreen } from './components/LockScreen';
import { ParentDataProvider, useParentData } from './data';
import { deviceLabel, isNative, onBackButton, rememberPushToken, setupPush } from './native';
import { ROUTE_TAB, type Nav, type Route, type SchoolSeg, type Tab } from './nav';
import { applyAppearance, hasPin } from './prefs';
import { Account } from './screens/Account';
import { AddChild } from './screens/AddChild';
import { AgendaScreen } from './screens/Agenda';
import { BulletinScreen, BulletinsScreen } from './screens/Bulletins';
import { ChildProfile } from './screens/ChildProfile';
import { ConductScreen } from './screens/Conduct';
import { DocumentsScreen } from './screens/Documents';
import { FeesScreen, ReceiptScreen } from './screens/Fees';
import { Help } from './screens/Help';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { MeetingsScreen } from './screens/Meetings';
import { MoreScreen } from './screens/More';
import { NewsScreen } from './screens/News';
import { Notifications } from './screens/Notifications';
import { PermissionsScreen } from './screens/Permissions';
import { SchoolInfo } from './screens/SchoolInfo';
import { Scolarite } from './screens/Scolarite';
import { AppearanceSettings, DataSettings, NotificationSettings, SecuritySettings, Settings } from './screens/Settings';
import { SetupMissing } from './screens/SetupMissing';

export function App() {
  useEffect(() => applyAppearance(), []);
  if (!isFirebaseConfigured) return <SetupMissing />;
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { user, loading, mfaPending } = useAuth();
  if (loading) return <Splash />;
  if (mfaPending) return <MfaChallenge />;
  if (!user) return <Login />;
  return (
    <ParentDataProvider key={user.uid}>
      <Locked uid={user.uid}>
        <Shell />
      </Locked>
    </ParentDataProvider>
  );
}

/** Après une minute en arrière-plan, l'app redemande le code (si un code est choisi). */
const RELOCK_AFTER_MS = 60_000;

function Locked({ uid, children }: { uid: string; children: React.ReactNode }) {
  const [locked, setLocked] = useState(() => hasPin(uid));
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS && hasPin(uid)) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [uid]);
  if (locked) return <LockScreen uid={uid} onUnlock={() => setLocked(false)} />;
  return <>{children}</>;
}

function LoadError() {
  const { signOut } = useAuth();
  return (
    <div className="flex h-full flex-col justify-center gap-4 bg-surface px-8 pt-safe-8 pb-safe-8">
      <h1 className="font-display text-2xl font-bold">Chargement impossible</h1>
      <p className="leading-relaxed text-ink-2">Vos informations n'ont pas pu être chargées. Vérifiez votre connexion internet puis réessayez.</p>
      <Button size="lg" onClick={() => window.location.reload()}>
        Réessayer
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </div>
  );
}

function Splash({ label = 'ParentEcole' }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface">
      <div className="text-2xl font-bold tracking-tight">
        Parent<span className="text-brand">Ecole</span>
      </div>
      <Loading label={label === 'ParentEcole' ? 'Chargement…' : label} />
    </div>
  );
}

function Shell() {
  const { user } = useAuth();
  const { loading, linking, children, error, unread, active } = useParentData();
  const [tab, setTab] = useState<Tab>('home');
  const [seg, setSeg] = useState<SchoolSeg>('notes');
  const [stack, setStack] = useState<Route[]>([]);
  const state = useRef({ tab, stack });
  state.current = { tab, stack };

  const scrollTop = () => document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  const go = useCallback((t: Tab, s?: SchoolSeg) => {
    setTab(t);
    if (s) setSeg(s);
    setStack([]);
    scrollTop();
  }, []);
  const push = useCallback((r: Route) => {
    setStack((st) => [...st, r]);
    scrollTop();
  }, []);
  const back = useCallback(() => {
    setStack((st) => st.slice(0, -1));
    scrollTop();
  }, []);
  const nav: Nav = { tab, seg, go, setSeg, push, back };

  useEffect(
    () =>
      onBackButton(() => {
        if (state.current.stack.length) {
          setStack((st) => st.slice(0, -1));
          return true;
        }
        if (state.current.tab !== 'home') {
          setTab('home');
          return true;
        }
        return false;
      }),
    [],
  );

  // Profil (le nom arrive juste après la création du compte : on réenregistre quand il change).
  const uid = user?.uid;
  const displayName = user?.displayName ?? '';
  const email = user?.email ?? '';
  useEffect(() => {
    if (!uid) return;
    void saveUserProfile(getFirebase().db, uid, { name: displayName, email }).catch(() => undefined);
  }, [uid, displayName, email]);

  // Jeton de notification (si les push sont activées dans cette version de l'APK) ;
  // toucher une notification ouvre les nouveautés.
  useEffect(() => {
    if (!uid) return;
    void setupPush(
      (token) => {
        const { db } = getFirebase();
        rememberPushToken(token);
        void addFcmToken(db, uid, token).catch(() => undefined);
        void saveDevice(db, uid, { token, label: deviceLabel(), platform: isNative ? 'android' : 'web', lastSeen: new Date().toISOString() }).catch(() => undefined);
      },
      () => {
        setStack([{ name: 'notifications' }]);
      },
    );
  }, [uid]);

  if (loading) return <Splash />;
  if (linking) return <Splash label="Liaison en cours…" />;
  if (error && children.length === 0) return <LoadError />;

  // Pas encore d'enfant lié : on commence par là.
  if (children.length === 0) {
    return (
      <div className="h-full lg:mx-auto lg:max-w-xl">
        <AddChild first onDone={() => go('home')} />
      </div>
    );
  }

  const top = stack[stack.length - 1];
  if (top?.name === 'add-child') {
    return (
      <div className="h-full lg:mx-auto lg:max-w-xl">
        <AddChild onDone={() => go('home')} onCancel={back} />
      </div>
    );
  }

  const shownTab = top ? ROUTE_TAB[top.name] : tab;
  // Écrans de menu et de réglages : listes groupées sur fond gris.
  const grouped = top ? GROUPED.has(top.name) : tab === 'more';
  const badges: Badges = active
    ? {
        news: active.announcements.filter((a) => a.important && !active.acks.has(a.id)).length,
        more: active.permissions.filter((p) => !active.permissionAnswers.has(p.id) && p.deadline >= todayISO()).length,
      }
    : {};

  return (
    <div className="flex h-full flex-col bg-surface lg:flex-row">
      <SideNav
        tab={shownTab}
        onChange={(t) => go(t)}
        badges={badges}
        unread={unread}
        onNotifications={() => setStack([{ name: 'notifications' }])}
        notificationsOpen={top?.name === 'notifications'}
      />
      <main id="main-scroll" className={cx('min-h-0 flex-1 overflow-y-auto', grouped && 'bg-ground')}>
        <div className="mx-auto w-full max-w-2xl pb-8 lg:max-w-3xl lg:py-4">{top ? <Stacked route={top} nav={nav} /> : <TabRoot tab={tab} nav={nav} />}</div>
      </main>
      <BottomNav tab={shownTab} onChange={(t) => go(t)} badges={badges} />
    </div>
  );
}

const GROUPED = new Set<Route['name']>(['settings', 'settings-notifs', 'settings-security', 'settings-data', 'help', 'account']);

function TabRoot({ tab, nav }: { tab: Tab; nav: Nav }) {
  switch (tab) {
    case 'home':
      return <Home nav={nav} />;
    case 'school':
      return <Scolarite nav={nav} />;
    case 'news':
      return <NewsScreen nav={nav} />;
    case 'fees':
      return <FeesScreen nav={nav} />;
    case 'more':
      return <MoreScreen nav={nav} />;
  }
}

function Stacked({ route, nav }: { route: Route; nav: Nav }) {
  switch (route.name) {
    case 'notifications':
      return <Notifications nav={nav} />;
    case 'account':
      return <Account nav={nav} />;
    case 'bulletins':
      return <BulletinsScreen nav={nav} />;
    case 'bulletin':
      return <BulletinScreen nav={nav} id={route.id} />;
    case 'receipt':
      return <ReceiptScreen nav={nav} id={route.id} />;
    case 'child':
      return <ChildProfile nav={nav} />;
    case 'agenda':
      return <AgendaScreen nav={nav} />;
    case 'documents':
      return <DocumentsScreen nav={nav} />;
    case 'conduct':
      return <ConductScreen nav={nav} />;
    case 'meetings':
      return <MeetingsScreen nav={nav} />;
    case 'permissions':
      return <PermissionsScreen nav={nav} />;
    case 'school-info':
      return <SchoolInfo nav={nav} />;
    case 'settings':
      return <Settings nav={nav} />;
    case 'settings-notifs':
      return <NotificationSettings nav={nav} />;
    case 'settings-appearance':
      return <AppearanceSettings nav={nav} />;
    case 'settings-security':
      return <SecuritySettings nav={nav} />;
    case 'settings-data':
      return <DataSettings nav={nav} />;
    case 'help':
      return <Help nav={nav} />;
    case 'add-child':
      return null;
  }
}
