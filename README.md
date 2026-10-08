# ParentEcole

Suivi scolaire entre l'école et les parents.

- **App des parents** (`apps/parent`), en APK Android et en site web installable (iPhone, ordinateur) : présence du jour, frais et dates de renvoi, reçus, devoirs, conduite, communiqués, agenda.
- **Site web de l'école** (`apps/ecole`) : direction, surveillants, professeurs, caissiers, et super-administrateur de la plateforme.
- **Une seule base de données** (Firebase Firestore) : ce que l'école saisit apparaît aussitôt chez les parents, et l'app reste lisible sans réseau.

## Ce que fait chaque profil

| Profil | Où | Ce qu'il fait |
| --- | --- | --- |
| Parent | App Android (connexion Google ou e-mail) | Lie ses enfants (code élève + son téléphone), suit présences, frais, devoirs, conduite ; justifie une absence ; marque un devoir « vu » ; partage un reçu |
| Direction | Site école | Classes, élèves (fiche d'accès avec QR code), personnel, grille des frais et tranches, communiqués, agenda, tableau de bord |
| Surveillant | Site école (aussi sur téléphone) | Appel express (on coche seulement les absents et retards), justifications, conduite |
| Professeur | Site école | Appel et devoirs de ses classes, conduite |
| Caissier | Site école | Encaissement avec reçu imprimable, historique, liste de recouvrement exportable |
| Super-administrateur | Site école | Crée les écoles et leur directeur, peut ouvrir n'importe quelle école |

## Organisation du code

```
packages/shared/   Types, logique des frais et des présences, accès Firestore, composants d'interface
apps/parent/       App des parents (React + Capacitor) ; android/ = projet Android
apps/ecole/        Site de l'école (React)
push/              Envoi des notifications push (Cloudflare Worker, offre gratuite)
functions/         Variante de l'envoi en Cloud Functions (plan Blaze, non utilisée)
firestore.rules    Règles de sécurité (qui peut lire et écrire quoi)
tests/             Tests des règles contre l'émulateur Firestore
```

## Mise en route

### 1. Créer le projet Firebase (gratuit)

1. Sur <https://console.firebase.google.com>, **Ajouter un projet** (par exemple `parentecole`). Google Analytics n'est pas nécessaire.
2. **Build › Firestore Database › Créer une base de données** : mode production, emplacement `europe-west1`.
3. **Build › Authentication › Commencer**, puis activez **Adresse e-mail/Mot de passe** et **Google**.
4. **Paramètres du projet › Vos applications › Web (`</>`)** : enregistrez une application. Copiez les valeurs de `firebaseConfig` dans un fichier `.env` à la racine (modèle : `.env.example`).
5. **Authentication › Paramètres › Domaines autorisés** : ajoutez le domaine du site de l'école une fois en ligne.
6. Publiez les règles et les index : copiez `firestore.rules` dans **Firestore › Règles**, ou utilisez le déploiement automatique (voir plus bas).
7. Créez le premier super-administrateur : **Firestore › Démarrer une collection** `superadmins`, avec comme ID de document votre e-mail en minuscules (aucun champ requis).

### 2. Lancer en local

```bash
npm install
npm run dev:ecole     # site école : http://localhost:5174
npm run dev:parent    # app parents dans le navigateur : http://localhost:5173
```

Premier parcours :

1. Connectez-vous au site école avec le compte super-administrateur.
2. Créez une école et son directeur.
3. Connectez-vous avec le compte du directeur, puis créez les classes, la grille des frais et les élèves.
4. Imprimez la fiche d'un élève et suivez-la dans l'app parents.

### 3. L'APK Android

L'APK est construit par GitHub Actions : rien à installer sur l'ordinateur.

1. Sur GitHub, ouvrez **Settings › Secrets and variables › Actions › Variables** et ajoutez `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_GOOGLE_WEB_CLIENT_ID`, et facultativement `VITE_ECOLE_URL`.
2. Dans l'onglet **Actions**, lancez **APK Android (parents)** (bouton *Run workflow*). L'APK est téléchargeable dans les *Artifacts* du build.
3. Un tag `v1.0.0` poussé sur GitHub publie l'APK dans une *Release*, avec un lien public à envoyer aux parents.

**Connexion Google dans l'APK.** Elle exige que l'APK soit toujours signé avec la **même clé** (son empreinte SHA-1 est déclarée chez Google) :

1. Clé de signature : fichier `.jks` gardé hors du dépôt, avec ses mots de passe. **Sauvegardez-la** (clé USB, Drive) : sans elle, impossible de publier une mise à jour de l'app.
2. Console Firebase › Paramètres du projet › Vos applications › **Ajouter une application Android** : identifiant `cd.parentecole.app`, puis ajoutez les empreintes **SHA-1 et SHA-256** de la clé (`keytool -list -v -keystore <fichier>.jks`).
3. Authentication › Méthode de connexion › Google › **Configuration du SDK Web** : copiez l'**ID client Web** dans la variable GitHub `VITE_GOOGLE_WEB_CLIENT_ID`.
4. Secrets GitHub : `ANDROID_KEYSTORE_BASE64` (`base64 -w0 <fichier>.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Sans clé de signature, l'APK est signé en mode « debug » et la connexion Google n'y fonctionne pas. Il s'installe sur les téléphones, mais pas sur le Play Store.

Pour construire en local (Android Studio ou SDK installé) : `npm run android:sync`, puis ouvrez `apps/parent/android`.

### 4. Mettre les sites en ligne

Deux sites Firebase Hosting (cibles `ecole` et `parents` dans `.firebaserc`) :

```bash
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Le domaine de chaque site doit figurer dans Authentication › Paramètres › Domaines autorisés (pour la connexion Google). Le workflow **Déploiement Firebase** publie le site, les règles et les index à chaque push sur `main`, une fois le secret `FIREBASE_SERVICE_ACCOUNT` ajouté. Pour obtenir ce secret : console Google Cloud › IAM › Comptes de service › clé JSON, avec le rôle *Firebase Admin*.

## Sécurité

- **Pas de mot de passe dans le code.** Les comptes sont gérés par Firebase Authentication. Les droits sont vérifiés par le serveur (`firestore.rules`), pas par le téléphone.
- **Personnel.** Une personne a des droits seulement si son e-mail (vérifié) figure dans `members/{email}` avec un rôle. Un professeur n'agit que sur ses classes.
- **Vérification en deux étapes du personnel.** À la première connexion au site de l'école, chaque membre du personnel (et chaque super-administrateur) inscrit une application d'authentification (Google Authenticator, Microsoft Authenticator…). Le code à 6 chiffres est ensuite demandé à chaque connexion. Les règles Firestore refusent toute donnée de l'école à une session ouverte sans ce code. Les parents ne sont pas concernés.
  - Téléphone perdu : dans la console Firebase › Authentication › Utilisateurs, supprimez le compte de la personne. Elle se reconnecte avec le même e-mail et réinscrit une application. Ses droits (liés à son e-mail) sont conservés.
- **Parents.** Pour lier un enfant, il faut son code élève **et** un numéro de téléphone enregistré par l'école pour cet élève. Les matricules ne peuvent pas être listés.
- **Contrôle.** `npm run test:rules` vérifie ces règles contre l'émulateur (Java requis). La CI le fait à chaque push.

## Notifications push

Elles passent par un **Cloudflare Worker gratuit** (dossier `push/`), sans le plan Blaze de Firebase :

1. Quand l'école enregistre une absence ou un retard, un paiement, une note de conduite, un devoir ou un communiqué, le site dépose une demande dans `notifications/{id}` (seulement des chemins de documents ; les règles n'autorisent que le personnel de l'école).
2. Le Worker passe chaque minute, et tout de suite quand le site l'appelle (`POST /kick` avec le jeton Firebase). Avec un compte de service limité (`parentecole-push` : lecture-écriture Firestore et envoi FCM), il relit les documents, vérifie qu'ils sont bien de cette école, écrit le message et l'envoie à chaque appareil des parents concernés.
3. **APK** : `google-services.json` en secret GitHub `GOOGLE_SERVICES_JSON` (base64). **Site des parents** : bouton « Activer » à l'accueil et dans « Mon compte » (sur iPhone, après ajout à l'écran d'accueil).

Mise en place du Worker (une fois) :

```bash
cd push && npm install
npx wrangler login                                   # compte Cloudflare gratuit
npx wrangler secret put SERVICE_ACCOUNT < cle.json   # clé JSON du compte de service parentecole-push
npx wrangler deploy                                  # affiche l'adresse du Worker
```

Puis mettre cette adresse dans `VITE_PUSH_URL` (fichier `.env` et variable GitHub) et redéployer le site de l'école. L'offre gratuite limite chaque passage à une cinquantaine d'envois : un communiqué à toute une grande école part en quelques minutes.

Sans push, l'app affiche ces mêmes nouveautés sous la cloche de l'accueil.

## Commandes utiles

| Commande | Effet |
| --- | --- |
| `npm test` | Tests de la logique (frais, codes, appel) |
| `npm run test:rules` | Tests des règles de sécurité (émulateur Firestore) |
| `npm run typecheck` | Vérification des types |
| `npm run build` | Compilation des deux applications |
