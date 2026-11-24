# Vérifications de phase 01

## Tests automatisés

96 tests Vitest réussis localement : 30 existants, **66 ajoutés**.
Tous utilisent de vraies tables PostgreSQL ; seuls les échanges réseau OAuth et
la livraison d'emails sont simulés dans la suite d'intégration.

- `auth.test.ts` : 14 tests, inscription email, invitations invalides, email différent,
  normalisation, rôle imposé, politique de mot de passe, réservation consommée après
  panne, concurrence, vérification d'email, désactivation, champs protégés, compteur email.
- `oauth.test.ts` : 15 tests, refus sans invitation Google et Microsoft, acceptation
  avec cookie préparé, JWT signés par un fournisseur simulé, casse des emails,
  invitations invalides, mauvaise adresse, Google vérifié, refus de liaison implicite
  Microsoft, liaison explicite, désactivation et révocation de session avant callback.
- `auth-services.test.ts` : 13 tests, refus ADMIN pour les trois autres rôles,
  remplacement d'invitation expirée, sérialisation de créations concurrentes,
  employé déjà lié, récupération après réservation, bootstrap refusé si ADMIN existant,
  origine invalide, compteur concurrent, dernière méthode (dont concurrence),
  compte d'autrui, expiration et absence de cache de session en cookie.
- `auth-boundaries.test.ts` : 11 tests, chaque champ User protégé individuellement,
  employé appliqué dès l'inscription, limite IP native, renouvellement sans changer
  lastLoginAt, fraîcheur des sessions, démarrage avec seulement quatre variables,
  absence de SMTP et absence de données sensibles dans les logs de panne.
- `password-recovery.test.ts` : 4 tests, réponse neutre, lien à usage unique,
  révocation des sessions et audit sans données sensibles, vérification sans session,
  déconnexion immédiatement effective en base.
- `auth-security.test.ts` : 9 tests unitaires, signature/altération/expiration du
  cookie, attributs Secure/HttpOnly/SameSite, hash normalisé, configuration SMTP
  absente ou partielle, HTTPS/tenant et trois gabarits d'emails français échappés.

## Critères attendus du prompt

- Inscription sans invitation, email et OAuth simulé : **OK, refusée**.
- Invitation expirée, révoquée ou utilisée : **OK, refusée**, email et OAuth.
- Email différent de l'invitation : **OK, refusé**, message dédié, lien non consommé.
- Utilisateur désactivé : **OK**, nouvelle connexion refusée et session existante rejetée.
- Aucune liaison automatique Microsoft : **OK**, même avec un email prétendument vérifié.
- role/isActive/employeeId/mfaEnforced non modifiables : **OK**, tests individuels ;
  additionalFields input:false et endpoints inutilisés fermés.
- Dernière méthode impossible à délier : **OK**, y compris requêtes concurrentes.
- Acceptations concurrentes : **OK**, au plus un compte/audit d'acceptation.
- Panne après réservation : **OK**, lien consommé sans compte ; révocation/réinvitation testée.
- Normalisation : **OK**, trim/minuscules à l'inscription et après profils OAuth,
  aucune duplication lors de la liaison Google.

## Navigateur et exploitation locale

- 8 tests Playwright réussis : 2 historiques et 6 nouveaux, répartis sur 375/1280 px.
  Inscription depuis invitation, connexion, méthodes, déconnexion, pages publiques,
  absence de SMTP et refus de Server Action après retrait du rôle ADMIN.
  Captures relues : `docs/screenshots/phase01/`.
- lint, typecheck, test et build : **OK**.
- Séquence complète CI reproduite sous Linux Node 24 : **OK**, sans fichier .env,
  avec CI=true et seulement DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL et
  ENCRYPTION_KEY. Vérification GitHub distincte, statut consultable sur la PR.
- Second migrate dev : **aucune différence**, aucune migration supplémentaire.
  Migration init historique inchangée, toujours quatre index partiels déclaratifs.
- Images app/migrate : **build OK sans variables applicatives**. Migrations sur une
  base vide, démarrage HTTP et UID 1000 vérifiés ; outillage interdit absent du standalone.
- CLI locale et commande Compose avec `-p harnois-staging` : **OK**, création du lien,
  acceptation et refus après présence d'un ADMIN. Configuration locale jetable,
  aucun appel au serveur de staging réel.
- Envoi nodemailer vers Mailpit : **OK**, HTML français et texte reçus.
- Générateur Nginx : modèle produit et entrée URL invalide refusée.
- Audit npm production : **0 vulnérabilité** au 16 novembre 2026. Les alertes
  d'outillage héritées restent décrites dans PROGRESS.md.
- Contrôle récursif des paquets du standalone : un composant embarqué par Next.js
  stable reste identifié comme canary (`next/dist/compiled/react-is`, version
  `19.3.0-canary-278794d7-20261002`). Exception explicitement autorisée par le
  propriétaire le 16 novembre 2026, conservée dans AGENTS.md. Ce composant n'est
  pas une nouvelle dépendance du verrou ; Prisma/@visx/gensync restent absents.

## Limites

OAuth Google/Microsoft réel, SMTP Brevo, installation Nginx, DNS, pare-feu et TLS
du staging n'ont pas été vérifiés. Les simulations OAuth utilisent la vraie
configuration et les vrais endpoints Better Auth mais des réponses IdP locales.
Le modèle Nginx n'a pas été validé avec `nginx -t` sur le serveur cible.
La MFA est volontairement différée à la phase 02.
