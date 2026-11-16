# Harnois — règles du projet

Ces règles s'appliquent à toutes les phases (00 à 12). Interface et documentation
en français ; code, variables, branches et commits en anglais.

## Stack

- Next.js App Router, TypeScript strict, Route Handlers et Server Actions ; pas d'API séparée.
- TailwindCSS, shadcn/ui, lucide-react ; formulaires React Hook Form et Zod.
- PostgreSQL 17, Prisma 7.x explicitement épinglé (jamais le tag npm latest de Prisma).
- Client généré dans `src/generated/prisma`, ignoré par Git ; instance unique dans `src/server/db.ts`.
- Authentification en phase 01 : Better Auth, Google, Microsoft et email + mot de passe.
- 2FA maison en phase 02 : otplib, @simplewebauthn/server et @simplewebauthn/browser.
- Tests Vitest (unitaires et intégration PostgreSQL réelle), Playwright (e2e séparés).
- Stockage compatible S3 : SeaweedFS en développement ; production à décider en phase 07.
- Brevo pour emails/SMS ; Mailpit pour les emails en développement.
- Dépendances stables publiées depuis plus de 14 jours, versions exactes sans `^` ni `~`.
  Jamais de versions rc, beta, canary ou next. Vérifier aussi les dépendances transitives du verrou.
- Exceptions transitives autorisées par le propriétaire le 5 novembre 2026 :
  paquets @visx alpha et @prisma/engines-version imposés par Prisma 7.10.1,
  gensync@1.0.0-beta.2 imposé par Babel via eslint-plugin-react-hooks.
  Les conserver verrouillés ; ils ne doivent pas entrer dans l'image applicative standalone.
- Node.js 24 (`>=24 <25`). Ne pas changer la stack sans accord.
- PWA prévue en phase 12.

## Architecture

- `src/app/(auth)/` : connexion, invitation, `/mfa/setup`, `/mfa/verify`.
- `src/app/(app)/` : pages protégées de l'application.
- `src/app/api/` : Route Handlers.
- `src/server/auth/` : authentification, session, 2FA et permissions.
- `src/server/services/` : logique métier, un fichier par domaine, jamais dans les composants React.
- `src/lib/` : utilitaires partagés.
- `src/components/ui/` : composants shadcn ; `src/components/<domaine>/` : composants métier.
- `docs/PROGRESS.md` : avancement, décisions, points ouverts et idées pour plus tard.
- Toute mutation applicative suit : validation Zod → contrôle d'accès → service → AuditLog.
- Argent en Decimal, jamais en number flottant ; affichage en euros au format fr-FR.
- Archiver au lieu de supprimer (`returnedAt`, `revokedAt`, `status`) ; ne jamais effacer les historiques.
- Variables d'environnement validées par Zod au démarrage du serveur, pas au build.
  Le build ne demande aucun secret Google, Microsoft, Brevo ou S3.

## Règles métier

- Emails : toujours normalisés (trim + minuscules) avant écriture et avant recherche,
  via `emailSchema` dans `src/lib/validation.ts`, couvert par des tests unitaires.
- Devise : seule EUR est acceptée par la validation Zod ; conserver les champs currency pour l'avenir.
- Pôle et organisation : lorsqu'un employé a un pôle, le service fixe automatiquement
  son organisation à celle du pôle et refuse toute incohérence.
- Invitations : avant d'en créer une nouvelle, révoquer l'invitation en attente pour
  cette adresse, même expirée, dans la même transaction.
- Capacité des abonnements, comptes non partagés, cohérence HT/TVA/TTC et cycles
  hiérarchiques : contrôles dans les services, dans des transactions, avec des tests.

## Base de données

- Schéma validé en amont ; toute modification doit être justifiée dans la PR.
- Migrations avec `prisma migrate dev --name <nom>` ; ne jamais modifier une migration mergée.
- Les quatre index partiels sont déclarés dans le schéma (`partialIndexes`).
  Ne pas maintenir de SQL manuel séparé ; vérifier l'absence de dérive au second migrate dev.
- Tests locaux uniquement sur `harnois_test`, via `.env.test`, jamais sur la base de développement.
  Chaque test nettoie ses propres données, notamment par rollback transactionnel.
- En CI, utiliser directement la base jetable fournie par DATABASE_URL, sans Docker.

## Sécurité

- Toute page, Server Action et Route Handler protégé passe par `requireUser()` :
  session valide, utilisateur actif, 2FA validée si requise, permission suffisante.
- 2FA obligatoire pour ADMIN, IT_MANAGER, TECHNICIAN et tout utilisateur avec
  mfaEnforced=true, y compris après Google ou Microsoft.
- Inscription uniquement sur invitation.
- Phase 01 validée : réservation conditionnelle de l'invitation dans le hook public
  avant création, audit après création ; ne jamais modifier l'adaptateur Better Auth.
  Si la création échoue après réservation, révoquer et réinviter.
- Liaison automatique par email : Google vérifié seulement. Microsoft exige
  une liaison explicite avec session récente. Ne jamais délier la dernière méthode.
  Exception validée : supprimer le Account technique délié, avec audit sans jetons.
- Les champs additionnels User/Session restent input:false. La vérification MFA
  sera activée en phase 02 ; elle est volontairement non bloquante en phase 01.
- Secrets TOTP et clés de licence chiffrés en AES-256-GCM avec ENCRYPTION_KEY.
  ENCRYPTION_KEY : 32 octets encodés en 64 caractères hexadécimaux ; codes de secours hachés.
- Aucun mot de passe de logiciel tiers stocké dans l'application.
- Jamais de données personnelles, jetons ou secrets dans les logs.
- Ne jamais lire un fichier `.env` réel ; documenter les variables dans `.env.example`.
  Les processus peuvent charger les fichiers locaux nécessaires sans en afficher le contenu.

## Git et GitHub

- Jamais de push sur main. Une branche par phase/tâche : `feat/<phase>-<sujet>`,
  `fix/<sujet>`, `chore/<sujet>` ; phase 00 : `chore/00-bootstrap`.
- Conventional Commits en anglais, petits et cohérents.
- Avant chaque push : lint, typecheck, test et build passent en local.
- PR créée avec `gh pr create`, vers main. Description : résumé, changements du schéma,
  variables ajoutées, comment tester, captures de l'interface.
- Ne jamais merger une PR : le propriétaire merge.
- Même si ton compte GitHub a des droits d'administration, tu ne merges pas,
  tu ne modifies ni les règles de protection, ni les paramètres du dépôt, ni `.github/workflows/`.
- `git push --force-with-lease` uniquement sur sa propre branche ; jamais `--force`.
- Si la CI doit évoluer, l'expliquer dans la PR, sans modifier les workflows.

## CI et production

- Runner auto-hébergé, Node.js 24. Ordre non interactif : npm ci, npx prisma generate,
  npx prisma migrate deploy, npm run lint, npm run typecheck, npm run test, npm run build.
- Seules variables applicatives fournies : DATABASE_URL, BETTER_AUTH_SECRET,
  BETTER_AUTH_URL, ENCRYPTION_KEY, avec des valeurs de test.
- `npm run test` et le build fonctionnent avec ces seules variables ; aucun service externe requis.
- Suivre `gh pr checks --watch`. En cas d'échec : `gh run view <id> --log-failed`, corriger et repousser.
- Déploiement par le job du propriétaire après merge, avec compose.prod.yml et un env-file serveur.

## Méthode et définition de terminé

1. Relire AGENTS.md et docs/PROGRESS.md au début de chaque phase, proposer un plan,
   attendre sa validation avant de coder.
2. Poser une question si une information manque ; ne pas deviner.
3. Respecter le périmètre ; consigner les idées hors périmètre dans « Plus tard ».
4. Mettre à jour PROGRESS.md en fin de phase : Fait, Décisions, Points ouverts, Plus tard.
5. Couvrir les critères d'acceptation, les services et les refus d'accès par rôle avec
   des tests verts dès que ces fonctionnalités existent (authentification hors phase 00).
6. Vérifier l'interface à 375 px et 1280 px, ouvrir la PR et obtenir une CI verte.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
