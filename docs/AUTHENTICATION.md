# Authentification — phases 01 et 02

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
- Google : le profil doit fournir un email vérifié. Depuis la phase 02, une adresse
  existante exige une liaison explicite depuis Sécurité, comme Microsoft.
  Une connexion avec un compte déjà lié et une création sur invitation restent possibles.
- Microsoft : tenant d'organisation explicite (UUID sur une URL HTTPS), sans
  `common`. Son email ne permet jamais une liaison implicite, même si le profil
  prétend qu'il est vérifié. Un compte déjà lié peut naturellement se reconnecter.
- La page Méthodes de connexion permet la liaison explicite des deux fournisseurs.
  Cookie d'intention signé distinct, lié à l'utilisateur, à la session et au
  fournisseur ; preuve récente de moins de 10 minutes recontrôlée au callback.
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
expiration, utilisateur actif, politique MFA, rôle éventuel et preuve récente pour
les actions sensibles. Rôle, facteurs et session sont relus en base à chaque requête.
Un compte désactivé ne reçoit plus de session et ses anciennes sessions sont refusées.

Les endpoints natifs non utilisés (édition du profil, changement d'email,
suppression d'utilisateur, etc.) sont fermés. Le changement de mot de passe exige
une preuve récente via le hook central ; sa session de remplacement doit ensuite
repasser la vérification MFA. Le contrôle natif `freshAge` de Better Auth est désactivé
car il mesure l'âge de création de session, pas la preuve MFA ; le helper central
impose la fenêtre de 10 minutes sur toutes les opérations sensibles exposées.
Tous les champs additionnels User et Session ont `input:false` ; une tentative
d'écriture explicite est refusée. Les mutations sensibles ont leurs services et
audits. Les messages natifs Better Auth sont désactivés pour éviter les emails
dans les logs. Télémétrie explicitement désactivée.

AuditLog reçoit seulement les identifiants, actions et éventuellement providerId :
LOGIN_SUCCEEDED, LOGIN_FAILED, INVITATION_CREATED/REVOKED/ACCEPTED,
PROVIDER_LINKED/UNLINKED, PASSWORD_RESET/CHANGED et événements MFA. Pas de requête brute, email, jeton,
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

Le modèle de logs d'accès ne contient que date, méthode, statut, taille et catégorie
de route ; aucune URL, query, IP, adresse, Referer ni cookie. Les logs d'erreur du
virtual host sont réactivés dans `/var/log/nginx/harnois/error.log`. Nginx peut y
inclure une URI avec un jeton : ce répertoire est réservé à root, sans collecte externe.
Referrer-Policy:no-referrer est envoyé aussi par Next.js sur les routes à jeton.
Les logs de requêtes de développement Next.js sont désactivés.

Avant l'installation du virtual host, l'opérateur prépare le répertoire et installe
le modèle `docker/nginx/harnois.logrotate` après relecture :

```sh
sudo install -d -o root -g root -m 0700 /var/log/nginx/harnois
sudo install -o root -g root -m 0644 docker/nginx/harnois.logrotate /etc/logrotate.d/harnois
sudo nginx -t
sudo logrotate --debug /etc/logrotate.d/harnois
sudo stat -c '%a %U:%G %n' /var/log/nginx/harnois
sudo namei -l /var/log/nginx/harnois/error.log
sudo -u www-data test ! -r /var/log/nginx/harnois/error.log
```

Adapter `www-data`, le chemin du PID et celui de Nginx à l'installation. Le résultat
attendu pour le répertoire est `700 root:root` ; un utilisateur non root ne doit
pouvoir ni le lister, ni traverser son chemin. Le maître Nginx ouvre le journal
en root et les workers héritent du descripteur. Même si Nginx change le propriétaire
du fichier lors d'une réouverture, le répertoire 0700 maintient cette restriction.

Rotation quotidienne, 7 fichiers conservés, compression différée d'une rotation
pour laisser finir les anciens workers. Le modèle envoie `USR1`, puis valide la
configuration avec `nginx -t` et envoie `HUP` pour une recharge gracieuse. Cet
ajustement a été autorisé après un test local : avec le répertoire 0700, `USR1`
seul empêche les workers de rouvrir le chemin et ils continuent à écrire dans
le fichier tourné. Les nouveaux workers héritent du fichier ouvert par le maître.
Pas de rsyslog, de nouveau service systemd ni d'installation automatique sur le serveur.

## Politique de double authentification

La couche est propre à Harnois : aucun plugin `twoFactor` ou `passkey` Better Auth.
Elle s'applique après email/mot de passe, Google et Microsoft. ADMIN, IT_MANAGER,
TECHNICIAN et tout utilisateur avec `mfaEnforced=true` doivent disposer d'un facteur.
Un EMPLOYEE qui en active volontairement un doit aussi le vérifier à chaque connexion.
Seuls un TOTP confirmé ou une clé WebAuthn comptent comme facteur, jamais les codes.

- **Configuration requise** : obligation sans facteur confirmé. Redirection vers
  `/mfa/setup`, API `403 MFA_SETUP_REQUIRED`.
- **Vérification requise** : facteur présent, session sans preuve MFA. Redirection
  vers `/mfa/verify`, API `403 MFA_REQUIRED`.
- **Session vérifiée** : accès normal selon les permissions. Un EMPLOYEE sans
  obligation ni facteur peut accéder normalement après sa connexion primaire.
- **Vérification récente** : preuve MFA strictement inférieure à 10 minutes.
  Sans facteur, connexion primaire récente ou confirmation du mot de passe ;
  pour OAuth seul, déconnexion puis nouvelle connexion chez le fournisseur.

La promotion de rôle bloque dès la requête suivante. Les pages publiques redirigent
également une session incomplète ; l'adresse de retour reste interne à l'application.
Le hook global Better Auth n'autorise alors que **GET `/api/auth/get-session`**
et **POST `/api/auth/sign-out`**. Toutes ses autres routes sont bloquées, y compris
les mutations natives. Les autorisations MFA sont définies route par route :

| Route sous `/api/mfa/`          | Méthode | État autorisé                                   | Preuve récente              |
| ------------------------------- | ------- | ----------------------------------------------- | --------------------------- |
| `status`                        | GET     | Configuration, vérification, session vérifiée   | Non                         |
| `primary/confirm`               | POST    | Configuration ou session vérifiée, sans facteur | Produit une preuve primaire |
| `totp/enroll`                   | POST    | Configuration ou session vérifiée               | Oui                         |
| `totp/confirm`                  | POST    | Configuration ou session vérifiée               | Oui                         |
| `totp/verify`                   | POST    | Vérification ou session vérifiée                | Produit une preuve MFA      |
| `webauthn/register/options`     | POST    | Configuration ou session vérifiée               | Oui                         |
| `webauthn/register/verify`      | POST    | Configuration ou session vérifiée               | Oui                         |
| `webauthn/authenticate/options` | POST    | Vérification ou session vérifiée                | Non                         |
| `webauthn/authenticate/verify`  | POST    | Vérification ou session vérifiée                | Produit une preuve MFA      |
| `recovery/verify`               | POST    | Vérification ou session vérifiée                | Produit une preuve MFA      |
| `recovery/regenerate`           | POST    | Session vérifiée avec facteur                   | Oui                         |
| `factors/remove`                | POST    | Session vérifiée                                | Oui                         |
| `admin/reset`                   | POST    | Session vérifiée ADMIN, autre utilisateur       | Oui                         |

Un état autorisé ne dispense jamais de session active ni des validations du service.
Une confirmation primaire est refusée dès qu'un facteur existe. Les POST exigent
JSON et l'origine exacte de BETTER_AUTH_URL ; réponses sans cache. Les mutations
recontrôlent l'accès dans la transaction sous verrou de la ligne utilisateur.

## Facteurs, récupération et actions sensibles

TOTP : secret aléatoire de 20 octets, SHA-1, 6 chiffres, période 30 secondes,
tolérance ±1 période. Un pas déjà accepté ne peut pas être réutilisé. Le QR code
est produit localement côté serveur, sans service tiers ; secret disponible aussi
en texte. Un enrôlement non confirmé expire après 5 minutes et est lié à sa session.
Le secret en base est chiffré AES-256-GCM au format `v1:<iv>:<tag>:<données>`
(base64url), avec un contexte lié à l'utilisateur. ENCRYPTION_KEY conserve le format
64 caractères hexadécimaux ; ne pas la remplacer sans procédure de migration des secrets.

WebAuthn : rpID = hostname de BETTER_AUTH_URL, origin = origine de cette URL,
rpName Harnois. `residentKey: preferred`, `userVerification: preferred`, attestation
`none`, aucun `authenticatorAttachment` imposé. Ce sont des seconds facteurs :
présence utilisateur exigée, vérification locale PIN/biométrie préférée mais non
obligatoire. Les clés sont nommées (20 maximum par utilisateur), les identifiants
déjà enregistrés exclus. Chaque challenge expire après 5 minutes et est lié à
l'utilisateur, la session et l'usage ; une réponse l'utilise une seule fois, même
si elle est invalide. Origine, RP, propriétaire, signature et compteur sont vérifiés.
0 → 0 est accepté pour les passkeys synchronisées ; un compteur positif doit augmenter,
sinon refus et audit `COUNTER_REGRESSION`.

L'activation du premier facteur valide la session et affiche 10 codes une seule fois.
Chaque code contient 16 caractères (80 bits), affichés `XXXX-XXXX-XXXX-XXXX`, alphabet
sans ambiguïtés. La saisie ignore espaces et tirets et passe en majuscules. Stockage
uniquement d'une empreinte SHA-256 versionnée liée à l'utilisateur ; comparaison en
temps constant et consommation atomique. À 3 codes ou moins, l'interface invite à
les régénérer. La régénération invalide les anciens, y compris sous concurrence.

Ajout/suppression de facteur, régénération, liaison/déliaison de fournisseur,
changement de mot de passe et réinitialisation d'autrui exigent une preuve récente.
Le dernier facteur obligatoire ne peut pas être supprimé, même avec deux requêtes
concurrentes. Un EMPLOYEE sans obligation peut supprimer volontairement son dernier
facteur après vérification récente ; ses codes sont invalidés.

Les échecs TOTP, WebAuthn, récupération et confirmation primaire partagent un
compteur PostgreSQL par empreinte d'identifiant utilisateur. Cinq échecs sur 15 minutes
bloquent pendant 15 minutes à compter du cinquième. Une réussite ne remet pas la fenêtre
à zéro ; une tentative bloquée ne la prolonge pas. L'interface affiche le délai restant.
Échecs, consommation du challenge et compteur sont commités avant la réponse d'erreur.

Les notifications d'ajout confirmé, suppression, code utilisé et réinitialisation
partent après commit. Elles indiquent action, date et IP fournie par le proxy de
confiance (ou indisponible/commande locale), avec la marche à suivre en cas d'activité
inconnue. Aucun secret ni code dans l'email ou les logs. Un échec SMTP produit
`MFA_NOTIFICATION_FAILED` sans annuler la mutation ; reprise des envois prévue en phase 11.

## Réinitialiser la double authentification

Dans `/admin/mfa`, un ADMIN récemment vérifié peut réinitialiser un autre utilisateur,
jamais lui-même. La transaction supprime facteurs et codes, révoque toutes les sessions
et challenges MFA, et conserve un audit. L'utilisateur reçoit ensuite une notification.
Une obligation par rôle ou `mfaEnforced` subsiste : la connexion suivante impose
une nouvelle configuration.

Si le seul ADMIN a perdu ses facteurs et codes, l'opérateur peut lancer en local :

```sh
npm run auth:reset-mfa -- --email admin@example.org
```

En staging, sous **harnois-deploy**, depuis le dossier de travail du déploiement :

```sh
docker compose -p harnois-staging -f compose.prod.yml \
  --env-file /opt/harnois-ci/env/staging.env \
  run --rm --entrypoint npm migrate run auth:reset-mfa -- --email admin@example.org
```

En production, adapter projet/env-file comme pour l'invitation initiale. La commande
demande de saisir exactement `REINITIALISER` ; toute autre réponse ou fin d'entrée
annule. Elle écrit `MFA_RESET_CLI`, sans email dans le journal. Les variables SMTP
existantes sont désormais transmises aussi au service migrate. Aucun nouvel endpoint
HTTP ne donne accès à cette procédure d'opérateur.

## Tester sa clé de sécurité

Pour un test manuel local avec une base de démonstration, configurer BETTER_AUTH_URL
sur `http://localhost:3041`, lancer `npm run dev -- --port 3041`, puis ouvrir cette
adresse dans Chrome ou Edge. Ne pas utiliser `http://127.0.0.1:3041` pour WebAuthn.
Les tests automatisés réservent eux aussi 3041 : arrêter le serveur manuel avant leur lancement.

1. Se connecter avec un compte de démonstration ; un ADMIN sans facteur arrive sur
   `/mfa/setup`. Choisir « Clé de sécurité ou téléphone », donner un nom et enregistrer.
2. Choisir la clé USB/NFC dans la fenêtre du système. Avec `residentKey: preferred`,
   le navigateur ou le système peut demander de créer un PIN si la clé n'en a pas.
   Ce PIN appartient à la clé, pas à Harnois ; le saisir uniquement dans la fenêtre
   du système puis toucher la clé lorsque demandé. Ne jamais transmettre ce PIN.
3. Conserver les codes de secours affichés une seule fois, séparément de la clé.
4. Se déconnecter, se reconnecter avec la méthode primaire : `/mfa/verify` doit
   empêcher l'accès à Sécurité tant que « Utiliser ma clé » n'a pas réussi.
5. Dans Sécurité, ajouter une seconde clé nommée, distincte, après preuve récente.
   Tester aussi sa connexion. Le simple réenregistrement de la première est refusé.
6. Supprimer la première depuis Sécurité, puis vérifier que seule la seconde reste.
   Pour un rôle obligatoire, la suppression de cette dernière doit être refusée.
   Retirer un facteur de Harnois ne supprime pas nécessairement son identifiant
   résident de la clé : l'opérateur peut nettoyer uniquement l'entrée de test dans
   le gestionnaire officiel de la clé, sans réinitialiser la clé entière.

Le 26 novembre 2026, l'enregistrement et la reconnexion avec une YubiKey physique ont
réussi sous Windows/Chrome sur localhost:3041, avec intervention du propriétaire pour
les demandes système. La seconde clé et sa suppression sont vérifiées par authentificateurs
virtuels ; une seconde clé physique n'a pas été testée.

### Téléphone par QR code et changement de domaine

Sur `https://inventory.atlasv.io`, accessible au PC et au téléphone avec un certificat
reconnu, choisir un téléphone/autre appareil dans la fenêtre WebAuthn du navigateur.
Scanner son QR code avec Android/iPhone, autoriser la demande système, déverrouiller
le téléphone puis terminer l'enregistrement. Bluetooth/proximité peuvent être exigés
par le navigateur pour le transport `hybrid`. Se déconnecter puis refaire la vérification
avec le téléphone. Ce QR code système WebAuthn est distinct du QR code TOTP de Harnois.
Ce parcours réel reste à effectuer après déploiement HTTPS, comme convenu.

Un changement d'IP sans changement de hostname conserve le rpID. Un changement de
domaine modifie le rpID : les anciennes clés/passkeys ne sont plus utilisables sur
le nouveau domaine. Avant la bascule, prévoir un TOTP ou des codes de secours et
un opérateur de secours ; après connexion sur le nouveau domaine avec cette méthode,
réenregistrer les clés, puis retirer les anciennes entrées. En cas de perte totale,
utiliser la réinitialisation ADMIN ou CLI et refaire l'enrôlement. Actualiser aussi
BETTER_AUTH_URL, DNS, certificat, proxy et callbacks OAuth ; aucun code à modifier.

Références : [en-têtes Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header),
[logs Nginx](https://nginx.org/en/docs/http/ngx_http_log_module.html#access_log),
[rotation Nginx](https://nginx.org/en/docs/control.html#logs),
[liaison Better Auth](https://better-auth.com/docs/concepts/users-accounts).
