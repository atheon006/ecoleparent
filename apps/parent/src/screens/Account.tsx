import { errorMessage, unlinkChild } from '@pe/shared/api';
import { useAuth } from '@pe/shared/auth';
import { getFirebase } from '@pe/shared/firebase';
import { Button, Card, IconButton, Modal, useToast } from '@pe/shared/ui';
import { ArrowLeft, LogOut, Plus, Share2 } from 'lucide-react';
import { useState } from 'react';
import type { Nav } from '../App';
import { Avatar } from '../components/ChildPicker';
import { useParentData, type Child } from '../data';
import { nativeGoogleSignOut, shareText } from '../native';

export function Account({ nav }: { nav: Nav }) {
  const { user, signOut } = useAuth();
  const { children, links } = useParentData();
  const toast = useToast();
  const [removing, setRemoving] = useState<Child | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await unlinkChild(getFirebase().db, removing.link, links.filter((l) => l.studentId !== removing.id));
      toast(`${removing.student.firstName} a été retiré de votre compte.`);
      setRemoving(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-ground">
      <header className="flex items-center gap-2 px-3 pt-safe-3 pb-2">
        <IconButton label="Retour" onClick={nav.close}>
          <ArrowLeft size={24} aria-hidden="true" />
        </IconButton>
        <h1 className="font-display text-2xl font-bold">Mon compte</h1>
      </header>
      <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-8">
        <Card className="flex flex-col gap-0.5 p-4">
          <span className="text-[17px] font-bold">{user?.displayName || 'Parent'}</span>
          <span className="text-sm text-ink-3">{user?.email}</span>
        </Card>

        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-lg font-bold">Mes enfants</h2>
          {children.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3 p-3.5" as="div">
              <div className="flex items-center gap-3">
                <Avatar child={c} size={42} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">
                    {c.student.firstName} {c.student.lastName}
                  </span>
                  <span className="truncate text-[13px] text-ink-3">
                    {c.student.className} · {c.school?.name}
                  </span>
                  <span className="text-[13px] tracking-wide text-ink-2">{c.student.matricule}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Share2 size={16} aria-hidden="true" />}
                  onClick={() =>
                    void shareText(
                      'Code élève ParentEcole',
                      `Code élève de ${c.student.firstName} ${c.student.lastName} sur ParentEcole : ${c.student.matricule}`,
                    ).catch(() => undefined)
                  }
                >
                  Partager le code
                </Button>
                <Button variant="ghost" size="sm" className="text-danger-ink" onClick={() => setRemoving(c)}>
                  Retirer
                </Button>
              </div>
            </Card>
          ))}
          <Button variant="secondary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => nav.open('add-child')}>
            Ajouter un enfant
          </Button>
          <p className="text-[13px] leading-relaxed text-ink-3">
            L'autre parent peut suivre les mêmes enfants avec son propre compte : il lui suffit du code élève et de son numéro enregistré à
            l'école.
          </p>
        </section>

        <Button
          variant="danger"
          icon={<LogOut size={18} aria-hidden="true" />}
          onClick={async () => {
            await nativeGoogleSignOut();
            await signOut();
          }}
        >
          Se déconnecter
        </Button>
        <p className="text-center text-xs text-ink-3">ParentEcole · version {__APP_VERSION__}</p>
      </main>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Retirer cet enfant ?"
        sheet
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmRemove()}>
              Retirer
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-ink-2">
          Vous ne verrez plus les informations de {removing?.student.firstName}. Vous pourrez le rajouter plus tard avec son code élève.
        </p>
      </Modal>
    </div>
  );
}
