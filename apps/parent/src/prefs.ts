import { useEffect, useState } from 'react';
import { isNative } from './native';

// Réglages propres à cet appareil (apparence, code de verrouillage) : gardés sur le téléphone,
// comme dans toute application. Les préférences de notification, elles, sont sur le compte.

export type ThemeChoice = 'light' | 'dark' | 'system';
export const FONT_SCALES = [0.9, 1, 1.12, 1.25] as const;
export const FONT_LABELS = ['Petit', 'Normal', 'Grand', 'Très grand'];

const THEME_KEY = 'pe.theme';
const FONT_KEY = 'pe.fontScale';
const PIN_KEY = 'pe.pin';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : le réglage vaut pour cette session seulement */
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function getTheme(): ThemeChoice {
  const v = read(THEME_KEY);
  return v === 'dark' || v === 'light' ? v : 'system';
}

export function getFontScale(): number {
  const v = Number(read(FONT_KEY));
  return (FONT_SCALES as readonly number[]).includes(v) ? v : 1;
}

export function setTheme(t: ThemeChoice) {
  write(THEME_KEY, t === 'system' ? null : t);
  applyAppearance();
  notify();
}

export function setFontScale(n: number) {
  write(FONT_KEY, n === 1 ? null : String(n));
  applyAppearance();
  notify();
}

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const isDark = () => getTheme() === 'dark' || (getTheme() === 'system' && !!darkQuery?.matches);

/** Applique le thème et la taille du texte à la page (appelé au démarrage et à chaque changement). */
export function applyAppearance() {
  const root = document.documentElement;
  const dark = isDark();
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--fs', String(getFontScale()));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1512' : '#f4f5f0');
  if (isNative) {
    void import('@capacitor/status-bar').then(async ({ StatusBar, Style }) => {
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: dark ? '#0e1512' : '#f4f5f0' }).catch(() => undefined);
    });
  }
}

darkQuery?.addEventListener?.('change', () => {
  if (getTheme() === 'system') {
    applyAppearance();
    notify();
  }
});

/** Réglages d'apparence courants (l'écran se met à jour quand ils changent). */
export function useAppearance() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { theme: getTheme(), fontScale: getFontScale(), dark: isDark() };
}

// ── Code de verrouillage ───────────────────────────────────────────────────

/** Empreinte du code liée au compte (le code lui-même n'est jamais enregistré). */
async function hashPin(uid: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`parentecole:${uid}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const hasPin = (uid: string) => !!read(`${PIN_KEY}:${uid}`);

export async function setPin(uid: string, pin: string | null) {
  write(`${PIN_KEY}:${uid}`, pin ? await hashPin(uid, pin) : null);
  notify();
}

export async function checkPin(uid: string, pin: string): Promise<boolean> {
  return read(`${PIN_KEY}:${uid}`) === (await hashPin(uid, pin));
}
