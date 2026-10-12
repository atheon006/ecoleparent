import { schoolYear } from '@pe/shared';
import { updateSchool } from '@pe/shared/api';
import { getFirebase } from '@pe/shared/firebase';
import { Button, Card, Checkbox, ErrorNote, Field, SelectField } from '@pe/shared/ui';
import { ImageUp, School } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader, useAction } from '../components/common';
import { useSchool } from '../school';

/** Réduit l'image à 256 px au plus et la renvoie en data URL légère (WebP, sinon PNG). */
async function compressLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Cette image n'a pas pu être lue."));
      i.src = url;
    });
    const scale = Math.min(1, 256 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    const data = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
    if (data.length > 200_000) throw new Error('Logo trop lourd même réduit : essayez une image plus simple.');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SettingsPage() {
  const { db } = getFirebase();
  const { school } = useSchool();
  const { busy, run } = useAction();
  const [name, setName] = useState(school?.name ?? '');
  const [address, setAddress] = useState(school?.address ?? '');
  const [phone, setPhone] = useState(school?.phone ?? '');
  const [email, setEmail] = useState(school?.email ?? '');
  const [hours, setHours] = useState(school?.hours ?? '');
  const [directorName, setDirectorName] = useState(school?.directorName ?? '');
  const [currency, setCurrency] = useState(school?.currency ?? '$');
  const [year, setYear] = useState(school?.schoolYear || schoolYear());
  const [saturday, setSaturday] = useState(school?.saturdayClasses ?? false);
  const [logo, setLogo] = useState(school?.logo ?? '');
  const [logoError, setLogoError] = useState<string | null>(null);
  if (!school) return null;

  const start = Number(schoolYear().slice(0, 4));
  const years = [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`);

  async function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    try {
      setLogo(await compressLogo(file));
    } catch (err) {
      setLogoError((err as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateSchool(db, school!.id, {
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          currency,
          email: email.trim(),
          hours: hours.trim(),
          directorName: directorName.trim(),
          schoolYear: year,
          saturdayClasses: saturday,
          logo,
        }),
      'Paramètres enregistrés.',
    );
  }

  return (
    <div>
      <PageHeader title="Paramètres de l'école" description="Ces informations apparaissent sur les reçus, les bulletins, les attestations et dans l'application des parents." />
      <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Identité</h2>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-ground">
              {logo ? <img src={logo} alt="Logo de l'école" className="size-full object-contain" /> : <School size={32} className="text-ink-3" aria-hidden="true" />}
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand bg-surface px-4 text-[15px] font-semibold text-brand hover:bg-brand-soft">
                  <ImageUp size={18} aria-hidden="true" /> {logo ? 'Changer le logo' : 'Ajouter le logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickLogo(e)} className="sr-only" />
                </label>
                {logo && (
                  <Button variant="ghost" onClick={() => setLogo('')}>
                    Retirer
                  </Button>
                )}
              </div>
              <span className="text-sm text-ink-3">PNG ou JPEG, de préférence carré. Il apparaît dans l'application des parents, sur les bulletins et les cartes.</span>
            </div>
          </div>
          {logoError && <ErrorNote>{logoError}</ErrorNote>}
          <Field label="Nom de l'école" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chef d'établissement" value={directorName} onChange={(e) => setDirectorName(e.target.value)} hint="Signataire des bulletins et attestations." />
            <SelectField label="Monnaie" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="$">Dollar ($)</option>
              <option value="FC">Franc congolais (FC)</option>
            </SelectField>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Contact</h2>
          <Field label="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Les parents peuvent appeler ce numéro depuis l'application." />
            <Field label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Field label="Heures d'ouverture du secrétariat" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Lundi à vendredi, 7 h 30 – 15 h" />
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Année scolaire</h2>
          <SelectField label="Année en cours" value={year} onChange={(e) => setYear(e.target.value)} hint="Les notes et bulletins sont rangés par année scolaire." wrapperClassName="sm:max-w-xs">
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </SelectField>
          <Checkbox label="Cours le samedi" hint="Sinon le samedi compte comme jour sans cours, comme le dimanche et les jours fériés." checked={saturday} onChange={(e) => setSaturday(e.target.checked)} />
          <div className="rounded-xl bg-ground px-3.5 py-2.5 text-sm text-ink-2">
            Préfixe des matricules : <strong>{school.codePrefix}</strong> (fixé à la création de l'école).
          </div>
        </Card>

        <Button type="submit" loading={busy} className="self-start">
          Enregistrer
        </Button>
      </form>
    </div>
  );
}
