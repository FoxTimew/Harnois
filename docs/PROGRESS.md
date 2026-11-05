# Avancement de Harnois

## Fait

- Plan de phase 00 validé le 5 novembre 2026.
- Base de travail : `main`, commit `60e3d6c963c68537e650b555064db2238a32875b`.
- Socle implémenté sur `chore/00-bootstrap` : Next.js App Router, TypeScript strict,
  TailwindCSS, shadcn/ui, ESLint, Prettier et page provisoire française.
- Client Prisma généré hors Git, singleton serveur, migration initiale et seed
  idempotent (1 organisation, 2 pôles, 1 site, 5 catégories).
- Migration `20261105160024_init` générée par `prisma migrate dev --name init` :
  quatre `CREATE UNIQUE INDEX ... WHERE`, sans retouche du SQL.
  Le second `prisma migrate dev`, exécuté immédiatement après, répond :
  `Already in sync, no schema change or pending migration was found.`
  Une seule migration existe ; les quatre index sont présents et valides en base.
- Validation Zod au démarrage ; refus des configurations invalides avec code de
  sortie 1 et messages sans valeurs sensibles. Build Docker sans variable applicative.
- `emailSchema` partagé (trim + minuscules), validation EUR et tests unitaires.
- 30 tests Vitest réussis, dont 7 tests PostgreSQL : écriture/relecture, nettoyage
  transactionnel, seed relançable, présence et comportement des quatre index partiels.
- Contrôles locaux avant publication : lint, typecheck, test et build réussis.
- 2 tests Playwright réussis ; captures relues à 375 px et 1280 px dans
  `docs/screenshots/`, sans débordement horizontal ni erreur JavaScript.
- Services locaux opérationnels : PostgreSQL 17, SeaweedFS 4.48, Mailpit.
  Bucket créé automatiquement et création relançable ; écriture/relecture S3
  signées vérifiées avec suppression du seul objet de test.
- Images de production construites, migration appliquée sur une base jetable,
  serveur standalone sain (HTTP 200) sous l'utilisateur node, UID 1000.
  L'image applicative ne contient ni fichier .env, ni CLI Prisma, ni @visx, ni gensync.
- Schéma, configuration Prisma et workflows du commit de départ inchangés.
  Ancien `partial_indexes.sql` supprimé conformément au plan révisé.

## Décisions

- Node.js 24 ; TypeScript 6.0.3 fonctionne avec Next.js 16.4.2 et typescript-eslint 8.72.0.
- Index partiels Prisma déclaratifs : aucune modification manuelle des migrations.
- SeaweedFS en développement ; bucket créé automatiquement.
- Clé de chiffrement : hexadécimal, 64 caractères.
- Base d'intégration locale dédiée `harnois_test` ; base jetable DATABASE_URL en CI.
- Seed de démonstration sans utilisateurs ni données personnelles.
- Versions npm exactes et verrou contrôlé : 477 entrées publiées avant la date
  limite du 21 octobre 2026 à 22:00 UTC. Images épinglées par version et digest.
- Exceptions transitives autorisées : @visx alpha et engines-version de Prisma,
  gensync beta de l'outillage Babel/ESLint ; absentes de l'image applicative.
- @hookform/resolvers 5.9.2 : la version 6.0.0 provoque un conflit npm ERESOLVE
  entre des dépendances homologues exigeant Effect 4 et Effect 3.
- shadcn/ui initialisé manuellement (configuration, utilitaires et composant Card),
  sans conserver sa CLI dans les dépendances de développement.
- Aucun wrapper de génération Prisma ni URL factice. `prepare-standalone.mjs`
  copie seulement les assets public/static omis par Next.js, pour npm start et Docker.
- Image Node complète pour build/migrate afin de fournir OpenSSL à Prisma ; image
  slim et sortie standalone uniquement pour le serveur applicatif.
- SeaweedFS dispose de 32 emplacements de volumes : cinq étaient insuffisants
  après l'allocation de la collection par défaut, empêchant les écritures du bucket.

## Points ouverts

- PR et résultat du runner auto-hébergé à renseigner après publication.
- `npm audit` : aucune vulnérabilité de production ; 10 alertes modérées
  d'outillage, issues de minimatch ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)).
  Le correctif minimatch 11.0.1 est publié le 27 octobre 2026 à 22:26 UTC et ne
  respecte pas encore les 14 jours. Réévaluer sa mise à jour après le
  10 novembre 2026 à 22:26 UTC, conformément à la politique de dépendances.

## Plus tard

- Phase 01 : authentification, invitations, permissions et refus d'accès testés.
- Phase 02 : 2FA obligatoire selon rôle et politique utilisateur.
- Phases métier : invariants transactionnels décrits dans AGENTS.md.
- Phase 07 : choix du stockage S3 de production.
- Phase 12 : PWA et service worker.
