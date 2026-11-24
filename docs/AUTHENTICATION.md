# Authentification — phase 01

## Configuration et périmètre

Better Auth et son adaptateur Prisma officiel sont épinglés à 1.7.15 (publication
du 1er novembre 2026), nodemailer à 10.3.1. La comparaison par la CLI officielle
avec les modèles existants n'a demandé aucune modification de User, Session,
Account ou Verification. Seul RateLimit est ajouté par la migration
`20261116145842_auth_rate_limit`. Aucun adaptateur modifié, aucune API interne.
La configuration de référence est `src/server/auth/config.ts`.

Pages : `/login`, `/invitation/[token]`, `/verify-email`, `/forgot-password`,
`/reset-password`, `/profile/security` et `/admin/invitations` (ADMIN uniquement).
Les noms, emails, rôles et méthodes affichés proviennent de la base ; aucun jeton
OAuth ni hash de mot de passe n'est envoyé aux composants de profil.

## Inscription et réservation

1. L'ADMIN saisit email, rôle et employé facultatif. Le service normalise l'email,
   refuse un utilisateur existant ou un employé déjà lié, puis sérialise les
   invitations de cette adresse par verrou transactionnel PostgreSQL.
2. Toute invitation encore en attente, même expirée, est révoquée avec son audit
   dans la même transaction. Le nouveau jeton contient 32 octets aléatoires ; seul
   son SHA-256 est stocké. Il expire après 7 jours.
3. L'envoi SMTP intervient après le commit. Un échec d'envoi laisse l'invitation
   en attente : corriger SMTP puis réinviter révoque proprement le lien précédent.
   L'absence de configuration est détectée avant création depuis l'interface.
4. Le lien prépare le parcours par POST `/api/invitations/prepare`, avec contrôle
   d'origine et limite de débit. Le cookie signé `harnois.invitation` contient
   l'identifiant et une expiration, jamais le jeton brut. HMAC-SHA256 avec domaine
   de signature propre, HttpOnly, SameSite=Lax, Secure hors boucle locale, 10 min.
   Le `state` et le PKCE OAuth restent entièrement gérés par Better Auth.
5. Le hook public `databaseHooks.user.create.before` vérifie l'invitation, l'email
   normalisé et l'employé. Il fait un `updateMany` conditionnel : identifiant,
   `acceptedAt=null`, `revokedAt=null`, `expiresAt>now`, puis exige `count=1`.
6. Le hook complète la création avec le rôle, l'employé, `emailVerified=true` et
   les valeurs serveur. Le hook `after` écrit INVITATION_ACCEPTED. Le cookie est
   effacé à l'inscription et au retour OAuth, y compris les refus.

La réservation est volontairement indépendante de la transaction de création
native de Better Auth. Deux acceptations ne peuvent pas réserver le même lien.
**Si la création échoue après réservation, le lien reste consommé sans compte.**
L'ADMIN le voit comme « Réservée sans compte », le révoque puis réinvite.
La CLI peut être relancée pour le premier administrateur tant qu'aucun ADMIN
n'existe. Cette limite résiduelle et cette récupération sont testées.

## Connexion et liaison

- Mot de passe : 12 à 128 caractères, vérification de l'adresse obligatoire.
  Le lien d'invitation constitue cette preuve ; aucune seconde vérification
  n'est imposée après son acceptation. La création par mot de passe ne connecte
  pas automatiquement. Vérification et récupération ont aussi leurs pages.
- Google : le profil doit fournir un email vérifié. C'est le seul fournisseur
  autorisé à lier automatiquement une adresse existante.
- Microsoft : tenant d'organisation explicite (UUID sur une URL HTTPS), sans
  `common`. Son email ne permet jamais une liaison implicite, même si le profil
  prétend qu'il est vérifié. Un compte déjà lié peut naturellement se reconnecter.
- La page Méthodes de connexion permet la liaison explicite des deux fournisseurs.
  Cookie d'intention signé distinct, lié à l'utilisateur, à la session et au
  fournisseur ; session active de moins de 5 minutes recontrôlée au callback.
  Les emails doivent correspondre. Les jetons OAuth reçus ne sont pas conservés.
- La déliaison passe par le service, qui verrouille la ligne User puis vérifie
  qu'une autre méthode utilisable subsiste. La suppression technique de Account
  est autorisée ; PROVIDER_UNLINKED conserve fournisseur, auteur et date.
  Les tentatives concurrentes ne peuvent pas supprimer toutes les méthodes.
- La réinitialisation expire après une heure, est à usage unique et révoque
  toutes les sessions. Elle permet aussi de définir un mot de passe après OAuth.

Un refus OAuth affiche un message neutre sur `/login`. Seule une différence avec
l'adresse d'une invitation valide affiche l'instruction de choisir un autre compte.

## Session, contrôle d'accès et journal

Sessions PostgreSQL de 7 jours, renouvellement après 24 heures d'usage, aucun
cache de session en cookie. Les lectures Server Component ne renouvellent pas
les cookies ; un appel HTTP de session depuis l'interface effectue ce renouvellement.
Le `proxy.ts` ne teste que la présence d'un cookie. Chaque page protégée, action
et endpoint protégé appelle ensuite `requireUser()` : session relue en base,
expiration, utilisateur actif, rôle éventuel, fraîcheur pour une liaison/déliaison.
Un compte désactivé ne reçoit plus de session et ses anciennes sessions sont refusées.

Les endpoints natifs non utilisés (édition du profil, changement direct de mot
de passe, changement d'email, suppression d'utilisateur, etc.) sont fermés.
Tous les champs additionnels User et Session ont `input:false` ; une tentative
d'écriture explicite est refusée. MFA reste non bloquante en phase 01 ; la phase 02
ajoutera sa vérification centrale. Les mutations sensibles ont leurs services et
audits. Les messages natifs Better Auth sont désactivés pour éviter les emails
dans les logs. Télémétrie explicitement désactivée.

AuditLog reçoit seulement les identifiants, actions et éventuellement providerId :
LOGIN_SUCCEEDED, LOGIN_FAILED, INVITATION_CREATED/REVOKED/ACCEPTED,
PROVIDER_LINKED/UNLINKED et PASSWORD_RESET. Pas de requête brute, email, jeton,
mot de passe, hash ou profil OAuth. `lastLoginAt` change à la création d'une session,
pas à son renouvellement. Déconnexion accessible dans l'espace personnel et l'accueil.

## Limites de débit

RateLimit stocke les compteurs partagés entre instances (pas de mémoire par processus).
Better Auth lit uniquement `X-Real-IP`. Limites par IP : connexion email/social
10/min, inscription 5/10 min, préparation d'invitation 5/10 min, envoi de vérification
et demande de réinitialisation 3/15 min, validation des liens 10/10 min,
callbacks 20/min. Limite générale 120/min. Création d'invitation ADMIN : 10/min.

En plus, compteur par SHA-256 d'email normalisé : 10 tentatives infructueuses/15 min.
Une tentative en cours réserve provisoirement une place par UPSERT conditionnel
atomique pour éviter un dépassement concurrent. Une connexion réussie remet le
compteur à zéro, y compris OAuth. À saturation, même statut et corps qu'un mauvais
mot de passe ; aucune indication sur l'existence du compte. Les limites sont
conservatrices et peuvent empêcher une connexion valide jusqu'à la fin de fenêtre.
Les compteurs anciens restent en base ; une purge technique bornée sera prévue
avec les tâches d'entretien, sans toucher aux historiques métier.

## Premier administrateur

En local, avec `.env` correctement renseigné et les migrations appliquées :

```sh
npm run auth:invite-admin -- --email admin@example.org
```

En staging, exécuter **en tant que `harnois-deploy`, depuis le dossier de travail
du dernier déploiement**, après construction de l'image migrate et migration :

```sh
docker compose -p harnois-staging -f compose.prod.yml \
  --env-file /opt/harnois-ci/env/staging.env \
  run --rm --entrypoint npm migrate run auth:invite-admin -- --email admin@example.org
```

En production, remplacer le projet par `harnois-production` et le fichier par
`/opt/harnois-ci/env/production.env`. Garder le même nom de projet que le déploiement
pour rejoindre son réseau et sa base. La commande affiche volontairement le lien
confidentiel à l'opérateur ; ne pas l'exécuter dans un job CI ni archiver sa sortie.
Elle refuse dès qu'un ADMIN existe, même désactivé. Aucun mot de passe par défaut.

## SMTP et fournisseurs

SMTP_HOST/PORT/FROM définissent le transport. SMTP_USER/PASSWORD sont tous deux
vides pour Mailpit ou tous deux renseignés pour Brevo. SMTP_FROM_NAME est facultatif.
SMTP_SECURE=true pour le TLS implicite ; pour Brevo sur 587 : false et
SMTP_REQUIRE_TLS=true. Mailpit sur 1025 : false/false. Ne pas désactiver la
validation des certificats. Sans SMTP, le serveur démarre ; un envoi renvoie une
erreur claire, identique pour une adresse existante ou absente. Sans identifiants
OAuth, les boutons correspondants sont indisponibles. Les tests CI injectent
un transport de collecte en mémoire ; aucun envoi réseau externe.

Déclarer exactement ces callbacks chez les fournisseurs :

- Google local : `http://localhost:3000/api/auth/callback/google`.
- Microsoft local : `http://localhost:3000/api/auth/callback/microsoft`.
- Google staging : `https://inventory.atlasv.io/api/auth/callback/google`.
- Microsoft staging : `https://inventory.atlasv.io/api/auth/callback/microsoft`.

Les boutons utilisent l'origine courante, aucun secret OAuth n'est public.

## Nginx, HTTPS et changement d'adresse

Le DNS local peut faire pointer `inventory.atlasv.io` vers `192.168.1.63`.
Le navigateur utilise le nom HTTPS, même en LAN. Fournir un certificat reconnu
par les postes ; le serveur a besoin de sorties vers Google, Microsoft et le SMTP.
L'accès aux pages reste limité au réseau local par l'infrastructure.

BETTER_AUTH_URL configure l'origine, APP_PORT le port et APP_BIND_ADDRESS
l'interface publiée. Valeur par défaut : 127.0.0.1, adaptée à Nginx sur le même hôte.
Avec un proxy distinct, choisir l'IP privée et **garantir par pare-feu que seul Nginx
peut joindre ce port**. Ne jamais accepter un X-Real-IP fourni directement par
le navigateur. Le modèle Nginx l'écrase avec `$remote_addr` et fixe Host/Proto.

Générer une configuration à relire (aucune installation ni recharge automatique) :

```sh
node scripts/render-nginx.mjs --url https://inventory.atlasv.io \
  --upstream 127.0.0.1:3000 \
  --cert /etc/letsencrypt/live/inventory.atlasv.io/fullchain.pem \
  --key /etc/letsencrypt/live/inventory.atlasv.io/privkey.pem > harnois.conf
```

Le fichier s'inclut dans le contexte `http` de Nginx. Après relecture, l'opérateur
l'installe, exécute `nginx -t`, puis recharge Nginx. Aucun fichier secret n'est lu
par le générateur. Un changement d'IP demande DNS, interface/pare-feu et upstream ;
un changement d'URL demande BETTER_AUTH_URL, DNS/TLS/Nginx et callbacks OAuth,
puis recréation de l'app avec le même projet Compose. Aucun changement de code.
Les anciennes sessions ne migrent pas entre domaines ; réémettre les anciens liens.

Le modèle de logs ne contient que date, méthode, statut, taille et catégorie
de route ; aucune URL, query, IP, adresse, Referer ni cookie. Les logs d'erreur du
virtual host vont dans `/dev/null`, car Nginx peut y inclure l'URI complète : cela
réduit le diagnostic proxy, à compenser par les statuts et métriques sans requêtes.
Referrer-Policy:no-referrer est envoyé aussi par Next.js sur les routes à jeton.
Les logs de requêtes de développement Next.js sont désactivés.

Références : [en-têtes Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header),
[logs Nginx](https://nginx.org/en/docs/http/ngx_http_log_module.html#access_log),
[liaison Better Auth](https://better-auth.com/docs/concepts/users-accounts).
