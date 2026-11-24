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
- Séquence du runner également reproduite avec succès dans un conteneur Linux
  Node 24, sans fichier .env, avec CI=true et les seules quatre variables applicatives :
  npm ci, prisma generate, migrate deploy, lint, typecheck, test, build.
  Cette reproduction locale utilise harnois_test ; elle ne remplace pas la CI GitHub.
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
- [PR #1](https://github.com/FoxTimew/Harnois/pull/1) mergée, base de la phase 01 :
  `cac5326b36b8be76785219d6c4045733e82ccdc8`.
  CI GitHub validée le 16 novembre 2026 sur le runner Linux VMGIT :
  [verify réussi en 4 min 22 s](https://github.com/FoxTimew/Harnois/actions/runs/42228834110/attempts/3),
  avec npm ci, génération Prisma, migration initiale sur base jetable, lint,
  typecheck, 30 tests et build. Le statut du dernier commit reste consultable sur la PR.
  Le déploiement est volontairement ignoré pour une PR.

### Phase 01

- [PR #2](https://github.com/FoxTimew/Harnois/pull/2) mergée le 24 novembre 2026
  sur autorisation explicite du propriétaire, au commit
  `f9b1143cd489ccaa838037b3728803e5a31f8227`. La CI de la PR était verte avant merge.
- Authentification Better Auth 1.7.15 : email/mot de passe, Google et Microsoft,
  inscription uniquement sur invitation ; aucune adaptation interne de la bibliothèque.
- Réservation atomique par updateMany conditionnel, rôle/employé fixés dès la création,
  email vérifié par le lien, cookie d'invitation signé et temporaire sans jeton brut.
- Liaison automatique Google vérifié uniquement, Microsoft explicite avec session
  récente recontrôlée au callback ; dernière méthode protégée même en concurrence.
- requireUser central, sessions de 7 jours sans cache cookie, renouvellement à 24 h,
  utilisateurs désactivés refusés ; champs additionnels non modifiables par le client.
- Compteurs RateLimit PostgreSQL, limite par IP et SHA-256 d'email, journal sans
  données personnelles ni secrets, télémétrie Better Auth désactivée.
- Seule évolution du schéma : RateLimit et migration auth_rate_limit. Second
  migrate dev : « Already in sync, no schema change or pending migration was found. »
- Pages françaises de connexion, invitation, récupération, sécurité et administration
  des invitations. 8 tests Playwright verts à 375/1280 px ; captures relues dans
  `docs/screenshots/phase01/`, sans débordement ni erreur JavaScript du parcours principal.
- 96 tests Vitest verts : 30 existants et 66 nouveaux (9 unitaires, 57 intégration).
  Les tests attendus sont détaillés dans `docs/PHASE01-VALIDATION.md`.
- lint, typecheck et build réussis localement. Images app/migrate construites sans
  variables applicatives au build ; migration sur base vide et standalone non root
  sain sous UID 1000. Absence de Prisma CLI, @visx, gensync et fichier .env dans app.
- Commande premier ADMIN vérifiée localement et dans le projet Docker local nommé
  harnois-staging, lien accepté par HTTP et seconde commande correctement refusée.
- Envoi SMTP réel vers Mailpit local reçu en HTML français et texte. Transport
  externe non nécessaire pour les tests ; absence de SMTP gérée sans bloquer le serveur.
- Documentation des callbacks, SMTP, récupération des réservations, Nginx et
  changements IP/URL ; commande exacte sous harnois-deploy avec l'env-file serveur.
- Séquence complète du runner reproduite sous Linux Node 24, sans .env et avec
  uniquement les quatre variables applicatives : npm ci, generate, migrate deploy,
  lint, typecheck, 96 tests et build réussis. Le statut GitHub de référence reste
  celui du dernier commit de la PR phase 01.

### Correctif Next.js préalable à la phase 02

- Branche `chore/deps-next-16.4.6`, depuis le main `f9b1143`.
  Next.js et son plugin ESLint passent de 16.4.2 à 16.4.6. Les onze versions
  modifiées du verrou appartiennent à Next.js ; elles sont stables et publiées
  le 9 novembre 2026. Aucune résolution transitive de Prisma n'est forcée.
- Lint, typecheck, 96 tests Vitest et build réussis avec les seules quatre
  variables applicatives de CI ; la base locale reste `harnois_test`.
  Huit tests Playwright réussis à 375 et 1280 px ; captures Accueil et Sécurité
  relues sans régression visible ni débordement horizontal.
- Images Docker app et migrate construites sans variables applicatives au build.
  L'app démarre sous UID 1000 et répond HTTP 200 sur `/`, `/login` et
  `/api/auth/get-session` avec les quatre variables de test.
- Effect 3.20.0 est absent du standalone et de l'image app, présent dans
  l'outillage et l'image migrate via `@prisma/config@7.10.1`.
  Aucun appel à `Schema.TemplateLiteral` ou à son compilateur d'expressions
  régulières pendant `prisma generate` et `prisma migrate deploy` : lecture
  du code et mesure V8 avec témoin positif. Détails et limites dans
  [la vérification des dépendances](DEPENDENCIES-2026-11-24.md).
- Aucun changement applicatif, de schéma, de migration, de variable ou de workflow.
  Phase 02 non commencée : reprise uniquement après feu vert du propriétaire,
  depuis main à jour.

## Décisions

- Correctif Next.js : date limite de résolution `.npmrc` avancée au
  `2026-11-10T00:00:00.000Z`, nécessaire pour les paquets du 9 novembre et
  conforme à la limite de quatorze jours au 24 novembre. Aucun ajout MFA.
- Le composant embarqué `react-is@19.3.0-canary-278794d7-20261002`, déjà autorisé,
  reste identique dans Next.js 16.4.6. Aucune nouvelle exception de préversion.
- Effect : conserver la version imposée par Prisma, sans override. Attendre
  une version stable de Prisma embarquant Effect corrigé, publiée depuis plus
  de quatorze jours, puis revalider migrations, génération et images.
- Phase 01 : better-auth et @better-auth/prisma-adapter 1.7.15, nodemailer 10.3.1.
  Les 19 nouvelles versions du verrou sont stables et antérieures au 2 novembre 2026,
  vérifiées auprès du registre npm. Date limite .npmrc actualisée ; exceptions
  transitives de phase 00 maintenues, aucune nouvelle exception dans le verrou.
- Contrôle approfondi du standalone : le propriétaire autorise le 16 novembre 2026
  le composant embarqué `next/dist/compiled/react-is@19.3.0-canary-278794d7-20261002`
  de Next.js 16.4.2, déjà présent dans cette version stable. Il n'a pas d'entrée
  distincte dans le verrou et reste dans l'image, contrairement aux exceptions Prisma/Babel.
- Réservation indépendante de la création native : si celle-ci échoue après réservation,
  l'ADMIN révoque puis réinvite. Ce cas résiduel est accepté, documenté et testé.
- Suppression du Account technique lors d'une déliaison autorisée avec audit durable.
- Seuls les endpoints Better Auth nécessaires à cette phase sont exposés ; édition
  générique du profil, changement d'email et autres mutations restent fermés.
- Compteur email : réservation provisoire d'une tentative pour limiter la concurrence,
  puis remise à zéro à la connexion réussie. Aucun email clair dans RateLimit.
- Nginx écrase X-Real-IP ; app liée à 127.0.0.1 par défaut. Proxy distant : IP privée
  et pare-feu obligatoire. Modèle générable sans secrets, aucune recharge automatique.
- Le modèle Nginx supprime les logs d'erreur de ce virtual host pour éviter les URI
  à jeton ; logs d'accès limités à date, méthode, statut, taille et catégorie.
- Playwright utilise le port 3041, le port 3000 étant utilisé par un autre projet local.

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
- Le propriétaire a installé les prérequis et le script `/opt/harnois-ci/ci.sh`
  sur Ubuntu 26.04, sous Node 24.13.1 et PostgreSQL 17.10. Ce script serveur reste
  hors Git et utilise une base jetable par exécution ; aucun Docker dans le job.

## Points ouverts

- Vérification réelle Google/Microsoft avec les applications OAuth du propriétaire,
  consentements, tenant organisation et callbacks configurés.
- Validation réelle du relais SMTP Brevo et de son expéditeur (Mailpit local vérifié).
- Installation/relecture Nginx, certificat TLS, DNS LAN vers 192.168.1.63, position
  réelle du proxy et filtrage du port app : non accessibles depuis cette session.
- La réservation peut rester consommée sans compte en cas de panne après updateMany ;
  procédure de récupération documentée, pas de compensation silencieuse.

- Audit réévalué le 24 novembre 2026 après mise à jour : aucune entrée Next.js ;
  douze entrées restent signalées, dont trois hautes pour la chaîne Effect /
  @prisma/config / Prisma (un même avis) et neuf modérées liées à minimatch.
  Effect reste vulnérable selon sa version : son absence de l'image app et
  l'absence d'appel au chemin concerné dans les commandes vérifiées ne
  constituent pas un correctif du paquet. Suivre
  [GHSA-7589-6fvf-x4pw](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw)
  et attendre une version stable compatible de Prisma ; ne pas forcer la transitive.
- Les neuf alertes modérées d'outillage proviennent de minimatch
  ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)).
  Le correctif minimatch 11.0.1, publié le 27 octobre 2026 à 22:26 UTC, respecte
  désormais les 14 jours. Son intégration reste à valider : ESLint, config-array
  et typescript-estree demandent actuellement minimatch 10.x. Ne pas forcer une
  version majeure transitive sans valider ces consommateurs ; prévoir une mise
  à jour compatible de l'outillage et de la date limite de résolution npm.

## Plus tard

- Purge bornée des compteurs RateLimit expirés avec les tâches d'entretien.
- Phase 11 : remplacer le SMTP direct par une file d'envoi avec reprise des échecs.
- Phase 02 : 2FA obligatoire selon rôle et politique utilisateur.
- Phases métier : invariants transactionnels décrits dans AGENTS.md.
- Phase 07 : choix du stockage S3 de production.
- Phase 12 : PWA et service worker.
