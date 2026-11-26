# Harnois

Webapp interne de gestion de parc informatique. Interface en français, utilisable
sur ordinateur et téléphone. La phase 01 ajoute la connexion sur invitation,
les méthodes Google/Microsoft et les parcours de récupération. La phase 02 ajoute
la double authentification TOTP, clés de sécurité et codes de secours, y compris après OAuth.
Voir [le fonctionnement et le déploiement de l'authentification](docs/AUTHENTICATION.md).

## Prérequis

- Node.js **24.x** et npm (développement vérifié avec Node 24.13.1, npm 11.8.0).
- Docker Engine / Docker Desktop avec Docker Compose v2 ou ultérieur.
- Git. Le client PostgreSQL local n'est pas nécessaire : `psql` est inclus dans le conteneur.
- Ports locaux disponibles : 5433 (PostgreSQL), 8333 (S3), 1025/8025 (Mailpit), 3000 (Next.js).

## Installation locale

Cloner le dépôt, puis installer les dépendances :

```sh
npm ci
```

Copier `.env.example` vers `.env` et `.env.test.example` vers `.env.test` (PowerShell :
`Copy-Item .env.example .env`, puis `Copy-Item .env.test.example .env.test`).
Renseigner les valeurs décrites dans ces exemples. Ces fichiers locaux sont ignorés
par Git et exclus des images Docker. Ne jamais les afficher dans les logs.

- Choisir un mot de passe PostgreSQL et le reporter, encodé si nécessaire, dans les deux URL.
- La base de développement s'appelle `harnois`, celle des tests **obligatoirement `harnois_test`**.
- Générer BETTER_AUTH_SECRET et ENCRYPTION_KEY : `openssl rand -hex 32` pour chacune.
  ENCRYPTION_KEY doit comporter exactement 64 caractères hexadécimaux.
- Définir les clés S3 locales et conserver le bucket `harnois-dev`.
- Les identifiants Google/Microsoft restent facultatifs ; les boutons sont alors désactivés.
- SMTP local : localhost:1025, SMTP_FROM renseigné, SMTP_SECURE=false et SMTP_REQUIRE_TLS=false.

Depuis une installation propre, exécuter :

```sh
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Ouvrir [Harnois](http://localhost:3000) et [Mailpit](http://localhost:8025).
Le service S3 écoute sur `http://localhost:8333` ; son endpoint requiert une
authentification S3, ce n'est pas une console Web.

Compose lance PostgreSQL 17, SeaweedFS 4.48 en mode `weed server -s3` et Mailpit.
Deux services ponctuels écrivent la configuration S3 dans un volume privé puis
créent le bucket avec une requête signée. Les identifiants ne sont pas incorporés
dans une image. Le démarrage est idempotent ; vérifier `docker compose ps -a` :
`s3-config` et `s3-bucket` doivent se terminer avec le code 0.

Le script d'initialisation PostgreSQL crée `harnois_test` lors du premier démarrage
du volume. Pour un ancien volume ne possédant pas cette base, exécuter une seule fois :

```sh
docker compose exec db psql -U harnois -d postgres -c "CREATE DATABASE harnois_test;"
```

Adapter `-U` si POSTGRES_USER est différent. Ne jamais utiliser `down -v` sur des
volumes contenant des données à conserver. `docker compose stop` conserve les données.

## Commandes

- `npm run dev` : génère Prisma et lance Next.js en développement.
- `npm run build` : génère Prisma, compile Next.js et prépare le standalone.
- `npm start` : lance `.next/standalone/server.js` après un build.
- `npm run lint` : ESLint et vérification Prettier.
- `npm run format` : formatage (schéma, configuration Prisma, migrations et workflows exclus).
- `npm run typecheck` : types des routes Next.js et TypeScript strict.
- `npm test` : tests unitaires et intégration sur une vraie base PostgreSQL.
- `npm run test:e2e` : tests Chromium à 375 px et 1280 px, séparés de Vitest.
- `npm run db:migrate` : synchronise la base de développement et génère le client.
  Pour créer une migration nommée, utiliser la commande explicite ci-dessous.
- `npm run db:seed` : données de démonstration idempotentes ; ne crée aucun utilisateur.
- `npm run db:test:migrate` : applique les migrations uniquement à la base de test configurée.
- `npm run auth:invite-admin -- --email admin@example.org` : invite le premier ADMIN,
  affiche le lien confidentiel et refuse si un administrateur existe déjà.
- `npm run auth:reset-mfa -- --email admin@example.org` : après confirmation explicite,
  réinitialise les facteurs et codes de secours et révoque toutes les sessions.
  Réservé à l'opérateur ; procédure de secours dans [AUTHENTICATION.md](docs/AUTHENTICATION.md).

Pour créer une migration nommée :

```sh
npx prisma migrate dev --name <nom>
npx prisma generate
```

Ne jamais modifier une migration déjà mergée. Les quatre index partiels sont
déclarés dans `schema.prisma` avec la fonctionnalité `partialIndexes`, sans SQL manuel.
Le seed crée 1 organisation, 2 pôles, 1 site et 5 catégories ; les clés uniques
existantes empêchent les doublons lors des exécutions suivantes.

## Tests

```sh
npm run db:test:migrate
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

En local, Vitest et Playwright chargent `.env.test`, qui remplace une éventuelle
DATABASE_URL héritée du terminal. Ils refusent toute base ne s'appelant pas
`harnois_test`. Aucun test d'intégration ne modifie la base de développement.
Les tests du socle annulent leurs transactions. Les parcours Better Auth utilisent
de vraies transactions et nettoient uniquement les enregistrements qu'ils créent,
même en cas d'échec. Playwright réserve le port 3041 et utilise la même base de test.

Les tests couvrent la normalisation des emails, EUR, la configuration du serveur,
le seed idempotent et l'effet réel des quatre contraintes partielles. Playwright
vérifie le titre, la langue, l'absence d'erreurs JavaScript et de débordement
horizontal ; les captures sont dans `test-results/`. Les tests d'authentification
couvrent les inscriptions, les refus d'accès, les réservations concurrentes,
OAuth simulé avec JWT signés, les sessions, les limites et la récupération.
Les tests MFA utilisent des réponses WebAuthn réellement signées et un authentificateur
virtuel Chromium. Le test matériel utilise `http://localhost:3041`, jamais l'adresse
IP littérale : voir le parcours YubiKey et téléphone dans AUTHENTICATION.md.

En CI (`CI=true`), aucun fichier local n'est chargé : la base PostgreSQL vide et
jetable est fournie directement par DATABASE_URL et migrée par le runner.
Seules DATABASE_URL, BETTER_AUTH_SECRET (32 caractères minimum), BETTER_AUTH_URL
et ENCRYPTION_KEY (64 caractères hexadécimaux) sont requises.
La séquence du runner reste inchangée :

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run typecheck
npm run test
npm run build
```

Ne pas définir CI=true pour contourner la protection de la base locale.
Les services d'authentification et les refus d'accès par rôle sont testés dès la phase 01.

## Production

Le propriétaire conserve l'environnement sur le serveur, hors du dépôt. Utiliser
`db:5432` comme hôte/port dans DATABASE_URL et une URL publique HTTPS pour BETTER_AUTH_URL.
Les variables et secrets sont injectés à l'exécution, jamais au build :

```sh
docker compose -p harnois-staging -f compose.prod.yml --env-file /opt/harnois-ci/env/staging.env --profile tools build
docker compose -p harnois-staging -f compose.prod.yml --env-file /opt/harnois-ci/env/staging.env up -d db
docker compose -p harnois-staging -f compose.prod.yml --env-file /opt/harnois-ci/env/staging.env run --rm migrate
docker compose -p harnois-staging -f compose.prod.yml --env-file /opt/harnois-ci/env/staging.env up -d app
```

Premier administrateur : exécuter sous **harnois-deploy**, depuis le dossier de
travail du dernier déploiement, avec le même nom de projet Compose :

```sh
docker compose -p harnois-staging -f compose.prod.yml \
  --env-file /opt/harnois-ci/env/staging.env \
  run --rm --entrypoint npm migrate run auth:invite-admin -- --email admin@example.org
```

En production, adapter le projet en `harnois-production` et l'env-file en
`/opt/harnois-ci/env/production.env`. Le lien affiché est confidentiel, ne pas
archiver cette sortie dans des logs. Voir [AUTHENTICATION.md](docs/AUTHENTICATION.md)
pour les callbacks OAuth, SMTP, Nginx, HTTPS et le changement d'IP/URL sans code.

Trois services : app (utilisateur non root, APP_BIND_ADDRESS:APP_PORT), db (volume persistant,
aucun port publié), migrate (profil tools). La cible de migration contient la CLI
Prisma, OpenSSL et les commandes d'invitation et de secours MFA ; la cible applicative
contient seulement le standalone Next.js.
Par défaut le port app est lié à 127.0.0.1 pour un Nginx sur le même hôte.
S'il est exposé sur une IP privée, le pare-feu doit le réserver au seul proxy.
Le script `prepare-standalone.mjs` copie `public/` et `.next/static/`, que Next.js
n'inclut pas automatiquement : le même résultat fonctionne avec `npm start` et Docker.

La configuration Zod est évaluée au démarrage du serveur par `instrumentation.ts`.
Le build ne requiert aucune variable applicative ni base accessible. La génération
Prisma utilise le `prisma.config.ts` validé, sans URL factice.

Le stockage S3 de production sera choisi en phase 07. Les identifiants externes
restent facultatifs tant que les fonctionnalités concernées ne sont pas présentes.
Une configuration partielle Google, Microsoft ou S3 est refusée au démarrage.

## Dépendances et contribution

Les versions directes sont exactes, le verrou est commité. `.npmrc` fixe la date
limite de résolution à `2026-11-10T00:00:00Z` pour respecter les 14 jours d'ancienneté.
Réévaluer cette date lors d'une future mise à jour de dépendances.
Les seules exceptions transitives autorisées figurent dans AGENTS.md.

Lire [AGENTS.md](AGENTS.md) et [docs/PROGRESS.md](docs/PROGRESS.md) avant chaque phase.
Branche et PR par phase ; ne jamais pousser sur main, merger, modifier les paramètres
du dépôt ou les workflows. Le déploiement est géré exclusivement par le propriétaire.
