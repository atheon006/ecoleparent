import { addFcmToken, saveUserProfile } from '@pe/shared/api';
import { AuthProvider, useAuth } from '@pe/shared/auth';
import { MfaChallenge } from '@pe/shared/mfa';
import { getFirebase, isFirebaseConfigured } from '@pe/shared/firebase';
import { Button, Loading, ToastProvider } from '@pe/shared/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomNav, SideNav, type Tab } from './components/BottomNav';
import { ParentDataProvider, useParentData } from './data';
import { onBackButton, setupPush, setupStatusBar } from './native';
import { Account } from './screens/Account';
import { AddChild } from './screens/AddChild';
import { AttendanceScreen } from './screens/Attendance';
import { FeesScreen } from './screens/Fees';
import { Home } from './screens/Home';
import { HomeworkScreen } from './screens/Homework';
import { Login } from './screens/Login';
import { Notifications } from './screens/Notifications';
import { SchoolScreen } from './screens/School';
import { SetupMissing } from './screens/SetupMissing';

export function App() {
  useEffect(() => {
    void setupStatusBar();
  }, []);
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
      <Shell />
    </ParentDataProvider>
  );
}

function LoadError() {
  const { signOut } = useAuth();
  return (
    <div className="flex h-full flex-col justify-center gap-4 bg-ground px-8 pt-safe-8 pb-safe-8">
      <h1 className="font-display text-2xl font-bold">Chargement impossible</h1>
      <p className="leading-relaxed text-ink-2">
        Vos informations n'ont pas pu être chargées. Vérifiez votre connexion internet puis réessayez.
      </p>
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
    <div className="flex h-full items-center justify-center bg-brand text-white">
      <Loading label={label} />
    </div>
  );
}

export type Overlay = 'notifications' | 'account' | 'add-child' | null;

export interface Nav {
  tab: Tab;
  go: (tab: Tab) => void;
  open: (overlay: Exclude<Overlay, null>) => void;
  close: () => void;
}

function Shell() {
  const { user } = useAuth();
  const { loading, linking, children, error, unread } = useParentData();
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const state = useRef({ tab, overlay });
  state.current = { tab, overlay };

  const go = useCallback((t: Tab) => {
    setTab(t);
    setOverlay(null);
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  }, []);
  const nav: Nav = { tab, go, open: setOverlay, close: () => setOverlay(null) };

  useEffect(
    () =>
      onBackButton(() => {
        if (state.current.overlay) {
          setOverlay(null);
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

  // Jeton de notification (si les push sont activées dans cette version de l'APK).
  useEffect(() => {
    if (!uid) return;
    void setupPush((token) => void addFcmToken(getFirebase().db, uid, token).catch(() => undefined));
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

  // Sur téléphone, ces écrans prennent toute la place ; sur ordinateur, ils s'ouvrent à côté du menu.
  const overlayScreen =
    overlay === 'add-child' ? (
      <AddChild onDone={() => go('home')} onCancel={() => setOverlay(null)} />
    ) : overlay === 'notifications' ? (
      <Notifications nav={nav} />
    ) : overlay === 'account' ? (
      <Account nav={nav} />
    ) : null;

  return (
    <div className="flex h-full flex-col bg-ground lg:flex-row">
      <SideNav
        tab={overlay ? null : tab}
        onChange={go}
        unread={unread}
        onNotifications={() => setOverlay('notifications')}
        onAccount={() => setOverlay('account')}
        current={overlay === 'notifications' || overlay === 'account' ? overlay : null}
      />
      {overlayScreen ? (
        <div className="min-h-0 flex-1 lg:mx-auto lg:w-full lg:max-w-3xl lg:py-4">{overlayScreen}</div>
      ) : (
        <>
          <main id="main-scroll" className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl lg:max-w-3xl lg:py-4">
              {tab === 'home' && <Home nav={nav} />}
              {tab === 'fees' && <FeesScreen nav={nav} />}
              {tab === 'attendance' && <AttendanceScreen nav={nav} />}
              {tab === 'homework' && <HomeworkScreen nav={nav} />}
              {tab === 'school' && <SchoolScreen nav={nav} />}
            </div>
          </main>
          <BottomNav tab={tab} onChange={go} />
        </>
      )}
    </div>
  );
}
