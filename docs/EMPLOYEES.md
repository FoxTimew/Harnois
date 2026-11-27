# Employés et référentiels

Les organisations, pôles et sites sont disponibles sous **Référentiels**.
ADMIN et IT_MANAGER les gèrent ; TECHNICIAN les consulte. Un référentiel n'est
supprimable que sans aucun rattachement, historiques compris. Le service
verrouille d'abord la ligne, recompte puis supprime : il ne laisse pas les
relations `SetNull` effacer silencieusement un rattachement concurrent.

Organisation : pôles, employés et abonnements. Pôle : employés. Site :
employés et équipements. Un pôle utilisé ne change pas d'organisation.

## Fiches et confidentialité

ADMIN et IT_MANAGER créent et modifient les employés. TECHNICIAN consulte
les informations professionnelles, sans téléphone ni dates d'arrivée/départ :
ces champs sont exclus de la sélection SQL et du DTO. EMPLOYEE n'accède qu'à
sa fiche liée, sans liste, autocomplétion, export ni accès à une autre fiche.

Un pôle impose son organisation. Une organisation explicite incohérente est
refusée. Les emails sont normalisés par `emailSchema`, les téléphones valides
en format international par libphonenumber-js/max, les dates sont civiles.
Aucune modification de l'email de la fiche ne change l'email du compte Harnois.

L'édition transmet la version `updatedAt` : une version dépassée est refusée.
La hiérarchie finale est vérifiée sans limite de profondeur, sous verrou partagé
avec les imports et les liaisons de comptes. On ne choisit pas de manager parti.
Un manager ne part pas tant qu'un collaborateur non parti lui est rattaché.

## Machine à états

| État initial | États suivants   | Conditions supplémentaires                             |
| ------------ | ---------------- | ------------------------------------------------------ |
| En arrivée   | Actif, Parti     | Pour Parti : date de départ renseignée/non future      |
| Actif        | En départ, Parti | Pour Parti : confirmation explicite de départ immédiat |
| En départ    | Actif, Parti     | Retour Actif : effacer explicitement la date de départ |
| Parti        | En arrivée       | ADMIN, preuve récente ; aucune réactivation du compte  |

Les transitions vers Parti exigent toujours une date de départ non future et
la réaffectation des collaborateurs non partis. Quand les deux dates existent,
le départ ne précède pas l'arrivée. Les éditions sans changement d'état sont
permises. Parti → Actif reste interdit. Une création/import initial peut
renseigner un état existant pour reprendre des données, sous les mêmes
invariants de dates et de hiérarchie.

Pour un départ avec compte actif, ADMIN peut choisir la désactivation dans
la même transaction, après preuve récente. Les contrôles de phase 03 sont
réutilisés : refus sur soi-même, dernier ADMIN actif conservé, sessions
révoquées, audit de sécurité. Un refus annule également le départ.
IT_MANAGER peut enregistrer le départ en laissant le compte actif ; le bandeau
de `/admin/users` signale alors ce compte aux administrateurs.

## Recherche

`Employee.searchText` contient prénom, nom et email, normalisés par décomposition
Unicode NFD, suppression des marques, minuscules et espaces normalisés.
La requête de recherche suit exactement la même normalisation. Ce champ n'est
jamais accepté du navigateur. Les caractères SQL de motif %, _ et \\ sont
échappés pour rechercher leur valeur littérale.

L'index GIN utilise **pg_trgm**, autorisé par le propriétaire pour accélérer
une recherche par contenu, par exemple « fevre » dans « lefevre ». Aucun
`unaccent` n'est utilisé. Un index B-tree ordinaire ne servirait pas ce besoin.
Les requêtes très courtes peuvent rester peu sélectives ; le planificateur
PostgreSQL décide de l'usage de l'index.

La migration remplit les lignes existantes avant de rendre le champ
obligatoire. L'index figure dans le schéma Prisma avec `gin_trgm_ops`.
Elle exécute `CREATE EXTENSION IF NOT EXISTS pg_trgm` dans chaque base, y compris
la base fantôme de `migrate dev`. Le module doit être disponible sur le serveur
et le rôle de migration doit disposer du droit CREATE sur la base.
Voir [la documentation PostgreSQL 17](https://www.postgresql.org/docs/17/pgtrgm.html).

Vérification par l'opérateur, sans secret affiché :

```sql
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name = 'pg_trgm';
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
```

L'image PostgreSQL 17 du projet contient le module. Sur PostgreSQL installé
par paquets, si la première requête ne retourne aucune ligne, faire installer
le module contrib pg_trgm correspondant exactement à PostgreSQL 17 par
l'administrateur, avant le déploiement. Ne pas installer une autre version majeure.

## Accès et historique

« Employés » est activé pour ADMIN, IT_MANAGER et TECHNICIAN. « Ma fiche »
apparaît dans le menu personnel lorsque l'utilisateur est lié. Les liens
d'IT_MANAGER vers invitations et journal métier sont sous **Gestion** ;
**Administration** est réservé à ADMIN. Les URL existantes sont conservées.

L'invitation depuis la fiche transmet uniquement l'identifiant de l'employé ;
le serveur charge son email et conserve les plafonds de rôle de l'invitant.
ADMIN peut lier un compte existant depuis la fiche, après preuve récente,
en réutilisant le service d'administration des utilisateurs.
L'historique est limité à cette entité et aux permissions d'audit :
ADMIN et IT_MANAGER, jamais TECHNICIAN ni EMPLOYEE.
Les futurs onglets indiquent que leur module n'est pas encore livré.

## Démonstration

`db:seed:demo` est indépendant du seed des référentiels de base. Il crée
50 identités fictives, 2 organisations, 4 pôles et 3 sites de démonstration,
sans comptes utilisateurs, invitations ni téléphones. Les emails utilisent
`.invalid`. Le manifeste vérifie l'identifiant, l'email, le prénom et le nom
de chaque employé existant ; toute identité étrangère ou modifiée fait refuser
la commande. Les fiches existantes du manifeste ne sont pas écrasées.

Deux protections obligatoires : variable `HARNOIS_ALLOW_DEMO_SEED=true`
(exactement) et argument `--confirm-demo`. Ne jamais définir cette variable
en production. Le propriétaire la configure dans son fichier de staging.

```bash
npm run db:seed:demo -- --confirm-demo

docker compose -p harnois-staging -f compose.prod.yml \
  --env-file /opt/harnois-ci/env/staging.env \
  run --rm --entrypoint npm migrate run db:seed:demo -- --confirm-demo
```

Une relance crée seulement les entrées manquantes du manifeste. La commande
ne supprime jamais d'employé réel pour se rendre exécutable.
