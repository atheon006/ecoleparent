import { useAuth } from '@pe/shared/auth';
import { cx } from '@pe/shared/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkPin, setPin } from '../prefs';
import { Icon } from './Icon';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** Pavé de 4 chiffres (déverrouillage, ou choix d'un nouveau code). */
export function PinPad({ title, hint, error, onComplete }: { title: string; hint?: string; error?: string | null; onComplete: (pin: string) => void | Promise<void> }) {
  const [pin, setPinValue] = useState('');
  // Valeur courante lue par une référence : des appuis très rapides ne perdent aucun chiffre.
  const current = useRef('');
  const done = useRef(onComplete);
  done.current = onComplete;
  const press = useCallback((k: string) => {
    if (k === '⌫') current.current = current.current.slice(0, -1);
    else if (k && current.current.length < 4) current.current += k;
    else return;
    const next = current.current;
    setPinValue(next);
    if (next.length === 4) {
      current.current = '';
      void Promise.resolve(done.current(next)).finally(() => setPinValue(''));
    }
  }, []);

  // Clavier physique (ordinateur).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {hint && <p className="text-sm text-ink-3">{hint}</p>}
      </div>
      <div className="flex gap-4" aria-label={`${pin.length} chiffre${pin.length > 1 ? 's' : ''} sur 4`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('size-4 rounded-full border-2', i < pin.length ? 'border-brand bg-brand' : 'border-field')} />
        ))}
      </div>
      <p className="h-5 text-sm font-semibold text-danger" role="alert">
        {error}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k, i) =>
          k ? (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              aria-label={k === '⌫' ? 'Effacer' : k}
              className="flex size-[72px] items-center justify-center rounded-full bg-surface text-2xl font-bold shadow-sm active:bg-muted"
            >
              {k === '⌫' ? <Icon name="caret-left" size={24} /> : k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}

export function LockScreen({ uid, onUnlock }: { uid: string; onUnlock: () => void }) {
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-ground px-6 pt-safe-6 pb-safe-6">
      <span className="tone-g flex size-16 items-center justify-center rounded-[20px]">
        <Icon name="lock-key" size={34} />
      </span>
      <PinPad
        title="ParentEcole est verrouillé"
        hint="Entrez votre code à 4 chiffres"
        error={error}
        onComplete={async (pin) => {
          if (await checkPin(uid, pin)) onUnlock();
          else {
            setTries((n) => n + 1);
            setError('Code incorrect.');
          }
        }}
      />
      {tries >= 3 && (
        <button
          type="button"
          onClick={async () => {
            await setPin(uid, null);
            await signOut();
          }}
          className="min-h-11 text-sm font-bold text-brand"
        >
          Code oublié ? Se reconnecter avec son compte
        </button>
      )}
    </div>
  );
}
