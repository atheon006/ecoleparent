import { useAuth } from '@pe/shared/auth';
import { Button, Card } from '@pe/shared/ui';
import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { isNative } from '../native';
import { useWebPush } from '../push';

const DISMISS_KEY = 'pe.pushPromptDismissed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Proposition d'activer les notifications du navigateur (site des parents, accueil). */
export function PushPrompt() {
  const { user } = useAuth();
  const { state, enable } = useWebPush(user?.uid);
  const [hidden, setHidden] = useState(dismissed);
  const [busy, setBusy] = useState(false);
  if (state !== 'default' || hidden) return null;
  return (
    <Card className="flex items-start gap-3 p-4" as="div">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <BellRing size={20} aria-hidden="true" />
      </span>
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold">Être prévenu tout de suite</span>
          <span className="text-[13px] leading-relaxed text-ink-2">
            Une notification sur cet appareil dès qu'une absence, un paiement ou un communiqué est enregistré.
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await enable().catch(() => undefined);
              setBusy(false);
            }}
          >
            Activer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setHidden(true);
              try {
                localStorage.setItem(DISMISS_KEY, '1');
              } catch {
                /* sans conséquence */
              }
            }}
          >
            Plus tard
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** État des notifications sur cet appareil (écran « Mon compte » du site des parents). */
export function PushSettings() {
  const { user } = useAuth();
  const { state, enable } = useWebPush(user?.uid);
  const [busy, setBusy] = useState(false);
  if (isNative) return null;
  const iosBrowser = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
  const text =
    state === 'granted'
      ? 'Activées sur cet appareil.'
      : state === 'denied'
        ? 'Bloquées par le navigateur. Autorisez les notifications dans les réglages du site, puis rechargez la page.'
        : state === 'unsupported'
          ? iosBrowser
            ? "Sur iPhone, ajoutez d'abord ParentEcole à l'écran d'accueil (bouton Partager › Sur l'écran d'accueil), puis ouvrez-le depuis l'icône."
            : 'Ce navigateur ne permet pas les notifications. Installez l’application Android ou utilisez Chrome.'
          : 'Recevez une alerte dès qu’une absence, un paiement ou un communiqué est enregistré.';
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-lg font-bold">Notifications</h2>
      <Card className="flex flex-col gap-3 p-4" as="div">
        <p className="text-[14px] leading-relaxed text-ink-2">{text}</p>
        {state === 'default' && (
          <Button
            size="sm"
            loading={busy}
            icon={<BellRing size={16} aria-hidden="true" />}
            onClick={async () => {
              setBusy(true);
              await enable().catch(() => undefined);
              setBusy(false);
            }}
          >
            Activer les notifications
          </Button>
        )}
      </Card>
    </section>
  );
}
