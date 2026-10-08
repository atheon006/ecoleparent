export function SetupMissing() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 bg-ground px-8 pt-safe-8 pb-safe-8">
      <h1 className="font-display text-2xl font-bold">Configuration manquante</h1>
      <p className="leading-relaxed text-ink-2">
        Cette version de l'application n'est reliée à aucune base de données. Renseignez les variables <code>VITE_FIREBASE_*</code> (voir le
        README du projet), puis recompilez l'application.
      </p>
    </div>
  );
}
