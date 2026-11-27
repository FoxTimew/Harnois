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
- [PR #3](https://github.com/FoxTimew/Harnois/pull/3) mergée sur autorisation explicite
  du propriétaire ; base de la phase 02 : `54b0be078e5fecf4ca18a369be95ca653978f528`.
  Le diagnostic demandé avant reprise compare les logs des PR #2 et #3 dans
  [CI-2026-11-26.md](CI-2026-11-26.md). Ralentissement surtout npm, compilation et
  checkout ; cause précise du runner non vérifiable sans métriques. Serveur inchangé.

### Phase 02

- Branche `feat/02-mfa` depuis main à jour. Couche MFA maison, sans plugin 2FA/passkey
  Better Auth, sans changement du schéma ni des migrations.
- Politique relue à chaque requête : rôles obligatoires, mfaEnforced, activation
  volontaire, facteurs confirmés et état de session. Pages, Server Actions, Route
  Handlers et hook Better Auth protégés ; 13 routes MFA explicitement autorisées.
- TOTP chiffré AES-256-GCM versionné et lié à son propriétaire, confirmation,
  fenêtre ±1 pas et refus du rejeu. WebAuthn multi-clés, challenges liés à la
  session et à usage unique, origine/RP/signature/compteur vérifiés.
- Dix codes de secours à 80 bits, empreintes SHA-256 versionnées liées à l'utilisateur,
  consommation atomique et régénération. Verrous utilisateur, limite commune de
  cinq échecs, audits sans secrets, notifications après commit.
- Preuve récente sur les actions sensibles ; Google et Microsoft exigent désormais
  une liaison explicite. Réinitialisation d'autrui par ADMIN et commande opérateur.
- 137 tests Vitest verts dans 11 fichiers (96 précédents, 41 supplémentaires),
  14 tests Playwright verts à 375/1280 px. Résultats détaillés des onze exigences
  dans [PHASE02-VALIDATION.md](PHASE02-VALIDATION.md). Six captures relues dans
  `docs/screenshots/phase02/`.
- Lint, typecheck, tests et build réussis avec les seules quatre variables de CI,
  sur `harnois_test`. Génération Prisma et migrate deploy réussis, aucune migration ajoutée.
- Images app/migrate construites sans variables applicatives au build ; démarrage
  app non root UID 1000 et HTTP 200 avec les quatre variables. Effect, Prisma CLI,
  @visx, gensync et fichiers .env absents de l'image app.
- Commande de secours vérifiée en local : EOF et annulation sans mutation, confirmation
  avec révocation/audit. Commande vérifiée aussi dans l'image migrate ; notification
  SMTP française HTML/texte reçue dans Mailpit, seul message de test nettoyé.
- YubiKey physique : enregistrement, déconnexion et reconnexion réussis le 26 novembre
  sous Chrome/Windows sur localhost:3041, avec intervention du propriétaire dans les
  fenêtres système. Accès Sécurité observé, dernière utilisation enregistrée et
  suppression du dernier facteur ADMIN désactivée. Compte jetable nettoyé.
- Rotation Nginx vérifiée dans un conteneur local : USR1 seul laisse les workers
  écrire dans l'ancien fichier ; USR1 puis validation et HUP les basculent vers
  le nouveau. Modèle logrotate exécuté, compression et refus de lecture non root vérifiés.
- Aucun changement de `.github/workflows/`, des paramètres GitHub ou du serveur.
  Publication de la PR et contrôle CI suivis dans le rapport de livraison.

### Phase 03

- [PR #4](https://github.com/FoxTimew/Harnois/pull/4) mergée sur autorisation
  explicite du propriétaire. Base de phase 03 : `de1c5ea639d82b9d6183e99e83e42b3c4e9de561`.
- Branche `feat/03-app-foundation`, travail isolé pour préserver la modification
  locale préexistante de `next-env.d.ts`.
- Permissions centralisées pour quinze ressources, quatre rôles et capacités
  particulières. Corrections validées : EMPLOYEE lit sa fiche et peut créer
  un ticket avec son employé lié ; commentaires déclarés pour ses tickets ;
  notifications destinataire pour tous, historique global ADMIN seulement.
- Utilisateurs ADMIN : rôle, statut, lien employé, reset MFA réutilisé,
  sessions consultables et révocation globale d'autrui avec preuve récente.
  Transactions verrouillées, interdiction sur soi et protection du dernier ADMIN.
  La création de session recontrôle aussi l'état actif sous verrou après insertion,
  pour fermer la course entre connexion et désactivation.
- `Session.lastSeenAt` nullable ; aucune activité historique inventée.
  Écriture conditionnelle une fois par minute, sans renouvellement ni audit.
  Migration `20261127103847_session_last_seen` ; second migrate dev sans dérive.
- Journal filtré côté serveur, détail nettoyé récursivement et export CSV borné
  à 10 000 lignes. Chaque export préparé produit un audit sécurité sans contenu.
  IT_MANAGER ne peut accéder aux événements sécurité, même via détail ou export.
- Navigation serveur, barre latérale repliable, navigation mobile, trois choix
  de thème mémorisés ; tableau URL/serveur, cartes mobiles et composants partagés.
  Page stable `/forbidden` en HTTP 200 final ; API refusée en HTTP 403.
- Aucun changement de variable, de workflow ou du serveur.
  Lint, typecheck, 464 tests Vitest et build réussis avec uniquement les quatre
  variables applicatives de CI. Les 26 tests Playwright couvrent les deux tailles ;
  24 captures de phase 03 sont conservées. PR et résultat CI suivis dans le rapport
  de livraison ; la phase n'est pas mergée par l'agent.
  Résultats détaillés et captures : [PHASE03-VALIDATION.md](PHASE03-VALIDATION.md).
  Matrice finale : [PERMISSIONS.md](PERMISSIONS.md).

## Décisions

- Phase 03 : permissions et limites détaillées dans PERMISSIONS.md. Sans modules
  métier, leurs entrées restent masquées ; pas de lien mort vers un employé.
  Les notifications sont exclusivement créées par les services ; les exports
  d'audit sont eux-mêmes des événements de sécurité.

- Phase 02 : otplib 13.6.0, SimpleWebAuthn serveur 14.1.0 / navigateur 14.0.0,
  qrcode 1.5.4, types qrcode 1.5.6. Les 62 entrées nouvelles/modifiées du verrou
  sont stables et antérieures au 10 novembre ; aucune nouvelle exception transitive.
- WebAuthn : residentKey/userVerification preferred, attestation none, aucun
  attachment imposé ; 20 clés maximum. Compteur nul constant accepté, compteur
  positif strictement croissant, y compris pour les identifiants synchronisés.
- Fenêtre récente strictement inférieure à 10 minutes ; preuve primaire seulement
  sans facteur. freshAge natif Better Auth remplacé par ce contrôle central car
  l'âge de création d'une session ne mesure pas sa dernière vérification MFA.
- Désactivation volontaire permise à EMPLOYEE sans obligation ; jamais de suppression
  du dernier facteur obligatoire. Liaison Google implicite de phase 01 remplacée
  par une liaison explicite récente, conformément à la validation du propriétaire.
- Nginx : répertoire root:root 0700, logrotate quotidien, 7 fichiers, compression
  différée. USR1 puis nginx -t et HUP autorisés par le propriétaire après reproduction
  du problème de réouverture ; aucun rsyslog ni nouveau service systemd.
- Tests WebAuthn sur localhost:3041, pas sur une IP littérale ; origine/rpID toujours
  dérivés de BETTER_AUTH_URL. Aucun nouveau paramètre d'environnement.
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
- Le modèle de phase 01 supprimait les logs d'erreur ; la phase 02 les rétablit
  dans un répertoire réservé à root. Les logs d'accès restent limités à date,
  méthode, statut, taille et catégorie.
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

- Phase 03 : parcours validés dans Chromium à 375/1280 px, sans nouvelle
  vérification sur téléphone physique, Safari, Firefox ou lecteur d'écran.
  Les alertes de flux interrompu observées dans le serveur Next de développement
  pendant les navigations automatisées sont documentées dans la validation.

- Test téléphone Android/iPhone par QR WebAuthn/hybrid en HTTPS : à faire après
  déploiement, sur accord du propriétaire. Une seconde clé physique, NFC, Windows
  Hello et Touch ID n'ont pas été testés réellement ; authentificateurs virtuels testés.
- Réenrôlement après changement de domaine documenté, non réalisé sur un staging réel.
- Les identifiants résidents de la YubiKey ne sont pas effacés par la suppression
  en base du compte de test ; seul le propriétaire peut nettoyer l'entrée de test
  dans son gestionnaire de clé, sans réinitialiser la clé entière.
- Installation effective du modèle Nginx/logrotate et vérification du PID/utilisateur
  sur le serveur à effectuer par le propriétaire ; aucun accès serveur utilisé.
- Diagnostic de lenteur VMGIT : ressources/IO, réseau et cache npm à mesurer par
  le propriétaire ; les logs CI seuls ne permettent pas d'isoler la cause.
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

- Phase 04 : activer les liens vers les fiches employés quand leurs routes existent.
- Phase 09 : fixer le demandeur du ticket depuis l'employé lié en serveur ;
  définir commentaires et réouverture. Les capacités sont seulement déclarées ici.
- Phase 11 : historique ADMIN des notifications via `notifications:read-all`,
  création des notifications exclusivement par les services.

- Purge bornée des compteurs RateLimit expirés avec les tâches d'entretien.
- Phase 11 : remplacer le SMTP direct par une file d'envoi avec reprise des échecs.
- Rotation des clés de chiffrement et entretien borné des challenges MFA expirés
  à concevoir dans les phases d'exploitation ; conserver le format versionné.
- Phases métier : invariants transactionnels décrits dans AGENTS.md.
- Phase 07 : choix du stockage S3 de production.
- Phase 12 : PWA et service worker.
