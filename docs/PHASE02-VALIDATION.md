# Validation de la phase 02 — 26 novembre 2026

## Diagnostic CI préalable

La PR #3 a duré 18 min 38 s contre 6 min 23 s pour la PR #2. Installation npm
2 min 07 → 6 min 14, build 2 min 00 → 5 min 56 et checkout 6 s → 2 min 11
expliquent l'essentiel de l'écart. Les tests ne passent que de 39,58 à 51,19 s.
Voir [mesures, sources et limites](CI-2026-11-26.md). Les sorties ne comportent
qu'un groupe pour le script complet : les durées par commande sont approximatives.
Cause probable : ressources/IO du runner ; réseau/cache npm possibles. Aucun
diagnostic matériel précis sans métriques, aucune modification serveur ou workflow.

## Onze exigences de test

| Exigence                                                            | Résultat et preuve                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN Google sans facteur limité à la configuration                 | OK : callback OAuth simulé avec JWT signé, session créée non vérifiée, requireUser et routes natives refusent l'accès. Parcours page de configuration vérifié dans Chromium. |
| ADMIN avec facteur et session non vérifiée limité à la vérification | OK : helper, routes MFA, Better Auth, pages et Server Action refusent ; seule vérification/session/déconnexion autorisée selon la liste explicite.                           |
| Promotion EMPLOYEE → ADMIN immédiate                                | OK : intégration et navigateur, y compris accès direct à une page publique après promotion.                                                                                  |
| TOTP rejeu, fenêtre et facteur non confirmé                         | OK : refus du rejeu et hors fenêtre, pas adjacent accepté, facteur non confirmé et codes ignorés dans la décision. Vérification concurrente à succès unique.                 |
| WebAuthn simulé, challenge et compteur                              | OK : authentificateur P-256 réellement signé et authentificateur virtuel Chromium ; challenge expiré, réutilisé et compteur en régression refusés ; 0 → 0 accepté.           |
| Codes consommés et régénération                                     | OK : un seul succès concurrent, seconde utilisation refusée, normalisation, anciens codes invalidés.                                                                         |
| Blocage après cinq échecs mixtes                                    | OK : TOTP, clé et codes partagent le compteur, blocage 15 minutes non prolongé par une tentative bloquée.                                                                    |
| Dernier facteur obligatoire sous concurrence                        | OK : deux suppressions simultanées ne retirent qu'un facteur ; le dernier reste. Désactivation volontaire EMPLOYEE testée séparément.                                        |
| Actions sensibles sans preuve récente                               | OK : ajout/suppression, codes, liaison/déliaison, mot de passe et reset ADMIN refusés ; preuve primaire ne remplace pas une MFA existante.                                   |
| Reset ADMIN révoque les sessions, interdit sur soi                  | OK : facteurs/codes/challenges et toutes les sessions supprimés, auto-reset et rôle non ADMIN refusés.                                                                       |
| TOTP chiffré au format versionné                                    | OK : v1 AES-256-GCM, IV aléatoire, authentification du contexte, propriétaire/purpose erronés ou altération refusés.                                                         |

Sources : `tests/integration/mfa.test.ts`, `oauth.test.ts`, `auth-services.test.ts`,
`auth-boundaries.test.ts`, `tests/unit/mfa-security.test.ts`, `tests/e2e/mfa.spec.ts`
et `auth.spec.ts`.

## Contrôles complémentaires et total

- **137 tests Vitest, 11 fichiers, tous verts** : 41 cas supplémentaires par rapport
  aux 96 tests précédents, avec extension des assertions des tests existants.
- **14 tests Playwright, tous verts** : 7 scénarios à 375 px et les mêmes à 1280 px,
  soit 6 exécutions supplémentaires. Total automatisé : **151 tests**.
- Cas supplémentaires : challenge lié à l'utilisateur/session/usage, mauvaise
  origine/RP/userHandle, présence utilisateur absente, challenge invalide consommé,
  compteur synchronisé positif, preuve primaire récente, absence de baisse de sécurité
  par mot de passe, refus CSRF, routes inconnues fermées, réponses sans cache,
  préparation d'invitation bloquée en MFA incomplète, notification après commit,
  échec SMTP audité, remplacement de session lors du changement de mot de passe,
  liaison Google désormais explicite et recontrôlée au callback.
- Lint, typecheck, test et build passent avec les seules quatre variables de CI.
  Aucun test local ne touche la base de développement ; données propres nettoyées.
- Images app/migrate construites sans secrets au build. Standalone UID 1000,
  HTTP 200 sur accueil/connexion/session ; absence de CLI Prisma, Effect, @visx,
  gensync et fichiers .env dans app. Aucun changement du schéma, migrations ou workflows.
- CLI locale : EOF et annulation sans modification, confirmation avec reset/audit.
  CLI en image migrate : reset et révocation vérifiés, email HTML/texte français
  reçu dans Mailpit. Ces vérifications opératoires sont distinctes des 151 tests.
- Modèle logrotate exécuté dans Nginx 1.30.0-alpine local, digest
  `sha256:0272e4604ed93c1792f03695a033a6e8546840f86e0de20a884bb17d2c924883` :
  nouveau fichier effectivement utilisé, ancien fichier inchangé après rotation,
  compression vérifiée, répertoire root:root 0700 et accès non root refusé.

## Interface et matériel

Captures sans données réelles, relues après les tests :

| Écran         | 375 px                                                     | 1280 px                                                      |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Configuration | [setup mobile](screenshots/phase02/setup-mobile.png)       | [setup desktop](screenshots/phase02/setup-desktop.png)       |
| Vérification  | [verify mobile](screenshots/phase02/verify-mobile.png)     | [verify desktop](screenshots/phase02/verify-desktop.png)     |
| Sécurité      | [security mobile](screenshots/phase02/security-mobile.png) | [security desktop](screenshots/phase02/security-desktop.png) |

YubiKey physique sous Windows/Chrome sur localhost:3041 : enregistrement réussi,
déconnexion, nouvelle connexion arrêtée sur `/mfa/verify`, authentification avec la
clé puis accès à `/profile/security`. Dernière utilisation affichée et audit de
vérification présents. Le propriétaire a effectué les gestes/PIN demandés par le système.
Compte temporaire ensuite réinitialisé et nettoyé dans harnois_test.

La seconde clé et sa suppression ont été testées avec authentificateurs virtuels.
Non testés réellement : seconde clé physique, NFC, Windows Hello, Touch ID,
téléphone Android/iPhone en hybrid, HTTPS staging, fournisseurs OAuth réels et Brevo.
Le parcours téléphone est reporté après déploiement avec accord du propriétaire.

## Écarts et configuration

- USR1 complété par `nginx -t` puis HUP, autorisé après constat que les workers
  ne peuvent rouvrir un chemin root:root 0700. Aucun service rsyslog/systemd ajouté.
- Origine de test localhost:3041 à la place de l'IP littérale, nécessaire au rpID WebAuthn.
- Contrôle récent central de 10 minutes remplaçant freshAge Better Auth, qui mesure
  la création de session et ne tient pas compte d'une revérification MFA.
- Limite de 20 clés par utilisateur pour borner les listes et les requêtes WebAuthn.
- Aucun nouveau nom de variable d'environnement ; les variables SMTP existantes
  sont aussi transmises à migrate pour la notification de la commande de secours.

La [documentation d'authentification](AUTHENTICATION.md) contient les 13 routes MFA,
leurs états autorisés, la procédure de secours et les conséquences d'un changement de domaine.
Les points restant à valider sur l'infrastructure sont suivis dans [PROGRESS.md](PROGRESS.md).
