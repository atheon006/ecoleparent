import { NOTIF_CATEGORIES, type NotifCategory, type UserPrefs } from '@pe/shared';
import { deleteParentData, errorMessage, removeDevice, saveUserPrefs } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { Button, ErrorNote, Modal, cx, useToast } from '@pe/shared/ui';
import { deleteUser } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { useState } from 'react';
import { SubHeader } from '../components/ChildPicker';
import type { IconName } from '../components/Icon';
import { PinPad } from '../components/LockScreen';
import { PushSettings } from '../components/PushPrompt';
import { List, Note, Pill, Row, Section, Switch, Tile, type Tone } from '../components/kit';
import { useParentData } from '../data';
import { nameInitials } from '../helpers';
import { isNative, nativeGoogleSignOut, shareText } from '../native';
import type { Nav } from '../nav';
import { FONT_LABELS, FONT_SCALES, hasPin, setFontScale, setPin, setTheme, useAppearance, type ThemeChoice } from '../prefs';

const PUSH_TOKEN_KEY = 'pe.pushToken';

const THEME_LABELS: Record<ThemeChoice, string> = { light: 'Clair', dark: 'Sombre', system: 'Comme le téléphone' };

export function Settings({ nav }: { nav: Nav }) {
  const { user, signOut } = useAuth();
  const { userDoc } = useParentData();
  const { theme, fontScale } = useAppearance();
  const notif = userDoc?.prefs?.notif ?? {};
  const enabled = NOTIF_CATEGORIES.filter((c) => notif[c.id] !== false).length;
  const pin = user ? hasPin(user.uid) : false;
  return (
    <div>
      <SubHeader title="Paramètres" onBack={nav.back} />
      <button type="button" onClick={() => nav.push({ name: 'account' })} className="pe-card mx-4 flex w-[calc(100%-2rem)] items-center gap-3.5 p-4 text-left">
        <span className="tone-a flex size-[52px] shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold">{nameInitials(user?.displayName || user?.email || 'P')}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold">{user?.displayName || 'Mon compte'}</span>
          <span className="block truncate text-[13px] text-ink-3">{user?.email}</span>
        </span>
      </button>
      <Section title="Préférences" />
      <List>
        <Row left={<Tile icon="bell" tone="a" />} title="Notifications" sub={`${enabled} catégorie${enabled > 1 ? 's' : ''} sur ${NOTIF_CATEGORIES.length}${userDoc?.prefs?.quiet ? ' · heures calmes' : ''}`} onClick={() => nav.push({ name: 'settings-notifs' })} />
        <Row
          left={<Tile icon="circle-half" tone="v" />}
          title="Apparence"
          sub={`${THEME_LABELS[theme]} · texte ${FONT_LABELS[FONT_SCALES.indexOf(fontScale as (typeof FONT_SCALES)[number])].toLowerCase()}`}
          onClick={() => nav.push({ name: 'settings-appearance' })}
        />
      </List>
      <Section title="Sécurité et données" />
      <List>
        <Row left={<Tile icon="lock-key" tone="b" />} title="Verrouillage et appareils" sub={pin ? 'Code activé' : 'Code désactivé'} onClick={() => nav.push({ name: 'settings-security' })} />
        <Row left={<Tile icon="cloud-check" tone="t" />} title="Données et compte" sub="Exporter, vider le cache, supprimer le compte" onClick={() => nav.push({ name: 'settings-data' })} />
      </List>
      <Section title="Aide" />
      <List>
        <Row left={<Tile icon="question" tone="b" />} title="Centre d'aide et contact" onClick={() => nav.push({ name: 'help' })} />
        <Row left={<Tile icon="info" tone="g" />} title="À propos" sub={`ParentEcole · version ${__APP_VERSION__}`} />
      </List>
      <div className="mx-4 mt-4">
        <button
          type="button"
          onClick={async () => {
            await nativeGoogleSignOut();
            await signOut();
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[15px] bg-danger-soft font-extrabold text-danger-ink"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

// ── Notifications ──────────────────────────────────────────────────────────

const CAT_STYLE: Record<NotifCategory, { icon: IconName; tone: Tone }> = {
  presences: { icon: 'calendar-check', tone: 't' },
  notes: { icon: 'chart-line-up', tone: 'g' },
  devoirs: { icon: 'notebook', tone: 'v' },
  frais: { icon: 'wallet', tone: 'a' },
  annonces: { icon: 'megaphone', tone: 'c' },
  agenda: { icon: 'calendar-blank', tone: 'b' },
  conduite: { icon: 'star', tone: 'a' },
};

export function NotificationSettings({ nav }: { nav: Nav }) {
  const { user } = useAuth();
  const { userDoc } = useParentData();
  const toast = useToast();
  const prefs: UserPrefs = userDoc?.prefs ?? {};
  const notif = prefs.notif ?? {};

  async function save(next: UserPrefs) {
    try {
      await saveUserPrefs(getFirebase().db, user!.uid, { ...next, tzOffset: -new Date().getTimezoneOffset() });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div>
      <SubHeader title="Notifications" onBack={nav.back} />
      <Section title="Ce que vous recevez" />
      <List>
        {NOTIF_CATEGORIES.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <Tile icon={CAT_STYLE[c.id].icon} tone={CAT_STYLE[c.id].tone} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{c.label}</span>
              <span className="block text-[13px] text-ink-3">{c.hint}</span>
            </span>
            <Switch checked={notif[c.id] !== false} label={c.label} onChange={(v) => void save({ ...prefs, notif: { ...notif, [c.id]: v } })} />
          </div>
        ))}
      </List>
      <Section title="Quand" />
      <List>
        <div className="flex items-center gap-3 px-4 py-3">
          <Tile icon="moon" tone="v" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Heures calmes</span>
            <span className="block text-[13px] text-ink-3">Pas de notification de 21 h à 6 h : elles attendent le matin dans les nouveautés</span>
          </span>
          <Switch checked={!!prefs.quiet} label="Heures calmes" onChange={(v) => void save({ ...prefs, quiet: v })} />
        </div>
      </List>
      <div className="mx-4 mt-4">
        <PushSettings />
      </div>
      <Note icon="info">Ces choix valent pour tous vos appareils. Les nouveautés restent toujours visibles dans l'application.</Note>
    </div>
  );
}

// ── Apparence ──────────────────────────────────────────────────────────────

export function AppearanceSettings({ nav }: { nav: Nav }) {
  const { theme, fontScale } = useAppearance();
  const index = FONT_SCALES.indexOf(fontScale as (typeof FONT_SCALES)[number]);
  const options: [ThemeChoice, string, string, string, string][] = [
    ['light', 'Clair', '#f4f5f0', '#ffffff', '#1e4a38'],
    ['dark', 'Sombre', '#0e1512', '#18221d', '#86cba6'],
    ['system', 'Auto', 'linear-gradient(90deg,#f4f5f0 50%,#0e1512 50%)', '#c9d2c6', '#2c6e50'],
  ];
  return (
    <div>
      <SubHeader title="Apparence" onBack={nav.back} />
      <Section title="Thème" />
      <div className="flex gap-2.5 px-4">
        {options.map(([id, label, bg, card, accent]) => (
          <button
            key={id}
            type="button"
            aria-pressed={theme === id}
            onClick={() => setTheme(id)}
            className={cx('grid flex-1 justify-items-center gap-2 rounded-[18px] border-2 bg-surface p-2.5 text-[13px] font-bold', theme === id ? 'border-brand' : 'border-line')}
          >
            <span className="grid h-[74px] w-full content-start gap-[5px] rounded-xl p-2" style={{ background: bg }}>
              <i className="block h-2 w-3/5 rounded" style={{ background: accent }} />
              <i className="block h-2 w-[90%] rounded" style={{ background: card }} />
              <i className="block h-2 w-3/4 rounded" style={{ background: card }} />
            </span>
            {label}
          </button>
        ))}
      </div>
      <Section title="Taille du texte" />
      <div className="pe-card mx-4 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink-3">A</span>
          <span className="font-display text-[15px] font-extrabold">{FONT_LABELS[index]}</span>
          <span className="text-xl font-bold text-ink-3">A</span>
        </div>
        <input
          type="range"
          min={0}
          max={FONT_SCALES.length - 1}
          step={1}
          value={index}
          onChange={(e) => setFontScale(FONT_SCALES[Number(e.target.value)])}
          aria-label="Taille du texte"
          className="w-full accent-brand"
        />
        <p className="mt-1.5 text-[12.5px] text-ink-3">Les écrans s'adaptent tout de suite.</p>
      </div>
      <Note icon="device-mobile">Ces réglages valent pour cet appareil.</Note>
    </div>
  );
}

// ── Verrouillage et appareils ──────────────────────────────────────────────

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function SecuritySettings({ nav }: { nav: Nav }) {
  const { user } = useAuth();
  const { userDoc } = useParentData();
  const toast = useToast();
  useAppearance(); // se met à jour quand le code change
  const [choosing, setChoosing] = useState(false);
  const pin = user ? hasPin(user.uid) : false;
  const devices = Object.values(userDoc?.devices ?? {}).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  const here = readLocal(PUSH_TOKEN_KEY);

  return (
    <div>
      <SubHeader title="Sécurité" onBack={nav.back} />
      <Section title="Ouvrir l'application" />
      <List>
        <div className="flex items-center gap-3 px-4 py-3">
          <Tile icon="lock-key" tone="b" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Code à 4 chiffres</span>
            <span className="block text-[13px] text-ink-3">Demandé à l'ouverture et après une minute en arrière-plan</span>
          </span>
          <Switch
            checked={pin}
            label="Code à 4 chiffres"
            onChange={async (v) => {
              if (v) setChoosing(true);
              else {
                await setPin(user!.uid, null);
                toast('Code désactivé.');
              }
            }}
          />
        </div>
      </List>

      <Section title="Appareils qui reçoivent les notifications" />
      <List>
        {devices.length === 0 ? (
          <Row left={<Tile icon="devices" tone="v" />} title="Aucun appareil enregistré" sub="Autorisez les notifications pour en ajouter un" />
        ) : (
          devices.map((d) => (
            <Row
              key={d.token}
              left={<Tile icon={d.platform === 'android' ? 'device-mobile' : 'devices'} tone={d.platform === 'android' ? 't' : 'v'} />}
              title={d.label}
              sub={`Vu le ${new Date(d.lastSeen).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
              end={
                d.token === here ? (
                  <Pill tone="ok">Cet appareil</Pill>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void removeDevice(getFirebase().db, user!.uid, d.token)
                        .then(() => toast('Cet appareil ne recevra plus de notifications.'))
                        .catch((err) => toast(errorMessage(err), 'error'))
                    }
                    className="h-9 rounded-xl border border-line px-3 text-[13px] font-bold"
                  >
                    Retirer
                  </button>
                )
              }
            />
          ))
        )}
      </List>
      <Note icon="shield-check">Vos données sont visibles uniquement par vous et par l'école de vos enfants. Aucune autre école n'y a accès.</Note>
      {choosing && <ChoosePin uid={user!.uid} onClose={() => setChoosing(false)} />}
    </div>
  );
}

function ChoosePin({ uid, onClose }: { uid: string; onClose: () => void }) {
  const toast = useToast();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Choisir un code" sheet>
      <div className="pb-4">
        <PinPad
          key={first ? 'confirm' : 'choose'}
          title={first ? 'Confirmez le code' : 'Nouveau code'}
          hint={first ? 'Tapez-le une seconde fois' : '4 chiffres faciles à retenir pour vous'}
          error={error}
          onComplete={async (pin) => {
            if (!first) {
              setFirst(pin);
              setError(null);
              return;
            }
            if (pin !== first) {
              setFirst(null);
              setError('Les deux codes sont différents. Recommencez.');
              return;
            }
            await setPin(uid, pin);
            toast('Code activé.');
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

// ── Données et compte ──────────────────────────────────────────────────────

export function DataSettings({ nav }: { nav: Nav }) {
  const { user } = useAuth();
  const { children, links } = useParentData();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    const data = {
      exportéLe: new Date().toISOString(),
      compte: { nom: user?.displayName, email: user?.email },
      enfants: children.map((c) => ({
        élève: { nom: c.student.lastName, prénom: c.student.firstName, classe: c.student.className, matricule: c.student.matricule, école: c.school?.name },
        présences: c.attendance.map((a) => ({ date: a.date, statut: a.status, motif: a.reason, justification: a.justification })),
        notes: c.grades.map((g) => ({ date: g.date, branche: g.subjectName, évaluation: g.title, note: g.score, sur: g.max, période: g.period })),
        bulletins: c.bulletins.map((b) => ({ période: b.periodLabel, année: b.year, pourcentage: b.percent, place: b.rank })),
        paiements: c.payments.map((p) => ({ date: p.date, frais: p.feeName, montant: p.amount, référence: p.reference })),
        conduite: c.conduct.map((k) => ({ date: k.date, type: k.type, titre: k.title })),
      })),
    };
    const json = JSON.stringify(data, null, 2);
    if (isNative) {
      await shareText('Mes données ParentEcole', json).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `parentecole-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Fichier téléchargé.');
  }

  async function clearCache() {
    const { db } = getFirebase();
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } finally {
      window.location.reload();
    }
  }

  async function deleteAccount() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await deleteParentData(getFirebase().db, user.uid, links);
      await deleteUser(user);
      await nativeGoogleSignOut();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'auth/requires-recent-login'
          ? 'Par sécurité, déconnectez-vous puis reconnectez-vous, et recommencez tout de suite la suppression.'
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SubHeader title="Données et compte" onBack={nav.back} />
      <Section title="Sur ce téléphone" />
      <List>
        <Row left={<Tile icon="cloud-check" tone="g" />} title="Consultation hors connexion" sub="Les dernières informations restent lisibles sans internet" end={<Pill tone="ok">Activée</Pill>} />
        <Row left={<Tile icon="trash" tone="a" />} title="Vider le cache" sub="Recharge tout depuis le serveur (utile en cas d'affichage bloqué)" onClick={() => void clearCache()} />
      </List>
      <Section title="Vos données" />
      <List>
        <Row left={<Tile icon="export" tone="b" />} title="Télécharger mes données" sub="Un fichier avec tout ce que vous voyez dans l'application" onClick={() => void exportData()} />
        <Row left={<Tile icon="trash" tone="c" />} title="Supprimer mon compte" sub="Les dossiers scolaires restent à l'école" onClick={() => setDeleting(true)} />
      </List>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer votre compte ?"
        sheet
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void deleteAccount()}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
          {error && <ErrorNote>{error}</ErrorNote>}
          <p>Votre compte, vos préférences et les liens avec vos enfants seront supprimés. Vous ne recevrez plus de notifications.</p>
          <p>Les dossiers scolaires (notes, présences, paiements) restent à l'école. Vous pourrez recréer un compte plus tard avec le code élève.</p>
        </div>
      </Modal>
    </div>
  );
}
