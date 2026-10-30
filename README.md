# Mali Stock — Bogolan Tricolore Premium · Expo + TypeScript + MySQL

Application mobile malienne de **gestion de stock**, habillée de la palette validée
**Bogolan Tricolore** (vert, jaune or, rouge latérite), avec une authentification
complète par **email / mot de passe** et **Google**, adossée à **MySQL**.

> Règle 60 · 30 · 10 — ivoire + vert structurent, l'or illumine, le rouge latérite signe.

---

## Architecture

```
Téléphone (Expo Go)
   │  HTTPS/HTTP + JWT
   ▼
API Node.js / Express  (server/)
   │  mysql2 (utilisateur restreint)
   ▼
MySQL 8.4  (base mali_stock)
```

L'application mobile **ne parle jamais directement à MySQL** : les identifiants de la
base et le hachage des mots de passe restent côté serveur.

| Dossier | Rôle |
|---|---|
| `App.tsx` | Providers globaux + aiguillage Splash / Connexion / Tableau de bord vendeur |
| `src/auth/` | Contexte d'authentification, stockage sécurisé du JWT, client API |
| `src/screens/LoginScreen.tsx` | Connexion / inscription vendeur (boutique incluse) + Google |
| `src/screens/DashboardScreen.tsx` | Tableau de bord vendeur : stock, scan, commandes, profil |
| `src/screens/AdminScreen.tsx` | Administration : boutiques et comptes vendeurs |
| `server/src/` | API Express, routes d'authentification, de stock et d'administration |
| `server/sql/schema.sql` | Schéma de la table `users` |
| `server/scripts/` | Démarrage / arrêt / initialisation de MySQL |

---

## Démarrage rapide

### 1. Base MySQL (déjà installée localement)

MySQL Community Server 8.4 est installé en mode portable dans
`C:\Users\dioma\AppData\Local\mali-stock\mysql-server` (hors OneDrive).
Les données sont dans `C:\Users\dioma\AppData\Local\mali-stock\mysql-data`.

```bash
npm run db:start    # démarre MySQL sur 127.0.0.1:3306
npm run db:stop     # arrête MySQL
npm run db:setup    # (re)crée la base, l'utilisateur applicatif et la table users
```

### 2. API

```bash
cd server
npm install
npm run dev         # http://localhost:4000 — écoute aussi sur le réseau Wi-Fi
```

Configuration : `server/.env` (déjà généré). Voir `server/.env.example` pour les clés.
Vérification rapide : `GET http://localhost:4000/api/health`.

### 3. Application Expo

```bash
npm install
npm start           # puis scanner le QR code avec Expo Go
```

En développement, l'app détecte automatiquement l'IP du PC via Expo Go et appelle
`http://<IP-du-PC>:4000`. Pour forcer une autre URL, créer un `.env` à la racine :

```bash
EXPO_PUBLIC_API_URL=https://api.mon-domaine.ml
```

Le téléphone et le PC doivent être sur le **même réseau Wi-Fi**, et le port **4000**
doit être autorisé par le pare-feu.

### Comptes de démonstration

```
Administrateur : admin@malistock.ml    / Sahel2026!Or
Vendeur        : vendeur@malistock.ml  / Bogolan2026!Vente
```

Ces comptes sont créés par `npm run seed:accounts` (côté `server/`).
Le compte vendeur de démonstration historique reste disponible :
`demo@malistock.ml / MaliStock2026!` avec la boutique **Bogolan Boutique** (Bamako)
et ses 9 produits.

**Tous les comptes sont des comptes vendeurs.** L'inscription publique crée un
compte vendeur avec sa boutique (nom, catégorie, ville) et l'administrateur peut
également créer des vendeurs depuis **Administration → Vendeurs** ou via
`POST /api/admin/users`.

L'administrateur est lui aussi un vendeur : il gère son propre stock et dispose en
plus de l'écran **Administration** (icône dans l'en-tête du tableau de bord, ou
Profil → Administration). Il y retrouve les onglets **Boutiques** et **Vendeurs**.

---

## QR produits & commandes

Le QR code et les commandes sont des outils du vendeur : ils ne nécessitent aucun
compte client. Chaque vendeur génère le QR de ses produits, scanne ses codes-barres
et gère ses commandes depuis son tableau de bord.

- `GET /api/public/shops` — annuaire des boutiques (paramètre `search`)
- `GET /api/public/shops/:id` — fiche boutique + catalogue
- `GET /api/public/products/:qrToken` — fiche produit scannée
- `POST /api/orders/manual` — commande créée par le vendeur sans compte client
  (`productId`, `quantity`, `customerName` et `customerPhone` facultatifs)
- `POST /api/orders` — commande historique liée à un compte client (conservée)
- `GET /api/orders` — boîte de réception du vendeur
- `PATCH /api/orders/:id` — `confirm`, `decline`, `complete` ou `cancel`

Depuis l'onglet **Commandes**, le vendeur appuie sur **Nouvelle commande**, choisit
un produit de son stock, la quantité et, s'il le souhaite, le nom et le téléphone du
client comptoir. La commande apparaît ensuite **En attente** : il peut la confirmer
(quantité ajustable), la refuser ou l'encaisser directement. L'encaissement
(espèces, Orange Money, Moov Africa, Wave Mali) crée la sortie de stock dans une
transaction MySQL. Le catalogue public expose le **prix** et la **disponibilité**,
jamais la quantité exacte ni le jeton QR. L'ancienne interface acheteur a été
retirée de l'application mobile.

---

## Authentification

### Email / mot de passe

- `POST /api/auth/register` — nom, email, mot de passe (8 caractères minimum),
  nom de boutique, catégorie et ville ; crée un compte vendeur (`pro`) avec sa boutique
- `POST /api/auth/login` — retourne un JWT valable 7 jours
- `GET /api/auth/me` — session courante (Bearer token)
- `POST /api/auth/logout` — invalidation côté client (JWT sans état)

### Administration

Toutes les routes `/api/admin` sont protégées par `requireAuth` + `requireAdmin` ;
un compte vendeur non administrateur reçoit une réponse `403`.

- `GET /api/admin/users` — liste des comptes
- `POST /api/admin/users` — création d'un compte vendeur avec nom, email, mot de
  passe et informations de boutique
- `GET /api/admin/shops` — liste des boutiques avec leurs indicateurs de stock
- `GET /api/admin/shops/:id` — informations de la boutique + stock détaillé
  (lecture seule)
- `PATCH /api/admin/shops/:id` — modification du nom, de la catégorie, de la ville
  et de la description de la boutique

Le rôle admin est stocké dans `users.is_admin` (migration 005). La migration 006
convertit tous les anciens comptes en vendeurs :

```bash
cd server
npm run migrate:admin     # migration 005 — colonne is_admin
npm run migrate:sellers   # migration 006 — tous les comptes deviennent vendeurs
npm run migrate:orders    # migration 007 — commandes vendeur sans compte client
```

Côté mobile, le JWT est conservé dans **expo-secure-store** (Keychain / Keystore),
jamais dans `AsyncStorage`. Au démarrage, l'app restaure la session via `/me`.

### Google

Le flux OAuth est intégré avec `expo-auth-session` :

- `POST /api/auth/google` vérifie le jeton d'identité Google côté serveur
  (`google-auth-library`), puis crée ou relie le compte MySQL.
- Un compte email existant est automatiquement relié à Google si l'email correspond.
- Le bouton reste explicite tant que la configuration n'est pas renseignée.

Pour l'activer plus tard :

1. **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID*.
2. Créer un client **Web application**, puis récupérer le Client ID.
3. Ajouter l'URI de redirection autorisée affichée par `expo-auth-session`
   (en development build : `mali-stock://oauthredirect`).
4. Renseigner les variables :

   ```bash
   # .env à la racine de l'app
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...       # optionnel
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...   # optionnel
   ```

   ```bash
   # server/.env
   GOOGLE_CLIENT_IDS=xxxxx.apps.googleusercontent.com
   ```

5. Redémarrer Expo et l'API.

> ⚠️ **Expo Go et Google** : Expo Go ne peut pas enregistrer de schéma de redirection
> personnalisé. Selon le type de client OAuth, tester Google de bout en bout peut
> nécessiter un **development build** (`npx expo run:android`) ou un proxy OAuth public.
> L'authentification email fonctionne, elle, directement dans Expo Go.

---

## Structure du projet

| Fichier | Contenu |
|---|---|
| `src/theme.ts` | Couleurs Bogolan, espacements, rayons, typographie, ombres |
| `src/data.ts` | Types et formatage partagés (prix, quantités, dates) |
| `src/components.tsx` | Hero, KPI, graphique, cartes produit, BottomNav, boutons |
| `src/auth/AuthContext.tsx` | Session, inscription, connexion, Google, déconnexion |
| `src/auth/api.ts` | Client fetch typé, URL auto-détectée, erreurs réseau |
| `src/auth/storage.ts` | JWT dans SecureStore (localStorage sur web) |
| `src/screens/ProOrdersScreen.tsx` | Gestion des commandes vendeur (création, confirmation, encaissement) |
| `src/screens/OrderModals.tsx` | Modales de création, confirmation, refus et encaissement |
| `src/screens/AdminScreen.tsx` | Administration : onglets Boutiques et Vendeurs |
| `src/screens/AdminShopsPanel.tsx` | Liste des boutiques, édition des infos et stock en lecture seule |
| `server/src/routes/auth.js` | Inscription vendeur / login / Google / me / logout |
| `server/src/routes/admin.js` | Comptes vendeurs, boutiques et stocks (admin) |
| `server/src/routes/public.js` | Fiche produit QR, annuaire et fiches boutiques |
| `server/src/routes/orders.js` | Création manuelle, cycle de vie des commandes et sortie de stock |
| `server/src/middleware/auth.js` | Vérification du Bearer JWT et des rôles |
| `server/sql/schema.sql` | Tables `users`, `products`, `stock_movements`, `orders` |

---

## Sécurité

- Mots de passe hachés avec **bcrypt** (12 rounds), jamais stockés en clair.
- JWT signé (secret de 96 caractères), émetteur et audience vérifiés.
- Limitation de débit sur les routes sensibles (`express-rate-limit`).
- MySQL écoute uniquement sur `127.0.0.1` ; l'utilisateur applicatif `mali_app`
  ne possède que `SELECT, INSERT, UPDATE, DELETE`.
- En-têtes HTTP sécurisés via `helmet`.
- Identifiants MySQL et secret JWT dans `server/.env` (ignoré par Git).

Pour la production : HTTPS obligatoire, rotation des secrets, vérification d'email,
réinitialisation de mot de passe et sauvegardes MySQL.

---

## Couleurs (identiques au pack Figma)

| Token | Hex | Style Figma |
|---|---|---|
| `colors.primary` | `#0A6B45` | BGT/Primary/Vert Mali Profond |
| `colors.gold` | `#DFA921` | BGT/Gold/Jaune Or du Mali |
| `colors.red` | `#B23A2E` | BGT/Red/Rouge Latérite |
| `colors.primaryDeep` | `#063D29` | BGT/Primary/Vert Forêt Bogolan |
| `colors.background` | `#F7F0DD` | BGT/Background/Ivoire Bogolan |
| `colors.accentSoft` | `#E9D8A6` | BGT/Surface/Ocre Tissé |

---

## Prochaines étapes

1. Brancher les API mobile money réelles (Orange Money Mali, Moov Africa, Wave Mali).
2. Activer Google Sign-In via ngrok / development build EAS.
3. Notifications push des nouvelles commandes (EAS) et export PDF des reçus.
4. Déploiement de l'API en HTTPS + APK/EAS pour l'installation hors Expo Go.
