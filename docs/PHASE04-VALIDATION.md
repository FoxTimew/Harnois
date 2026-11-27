# Validation de la phase 04

Branche : `feat/04-employees`. Base : `fa6f52f` (PR #5 mergée).
Validation locale du 27 novembre 2026, Node.js 24.13.1 et PostgreSQL 17.
La PR de cette phase reste à relire et à merger par le propriétaire.

## Contrôles

- `lint` : OK, 14,1 s.
- `typecheck` : OK, 9,9 s.
- `test` : **594/594**, 19 fichiers ; Vitest 45,80 s (commande complète 47 s).
- `build` : OK, 21,8 s.
- Ces quatre commandes ont été exécutées avec CI=true et les seules variables
  applicatives DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, ENCRYPTION_KEY.
- Images `app` et `migrate` construites par compose.prod.yml avec env-file.
  Build Docker sans variable applicative ; standalone démarré avec les quatre
  variables, HTTP 200 sous UID 1000.
- Commande du seed dans l'image migrate : refus de code 1 sans opt-in,
  puis refus de code 1 sans argument de confirmation, avant toute écriture.

Tests locaux uniquement sur `harnois_test`, Vitest et Playwright exécutés
successivement pour éviter d'interférer avec la protection du seed contre
les employés étrangers. **36/36 parcours Playwright réussis en 3,2 min**,
dont dix nouveaux (cinq parcours à chacune des deux largeurs). Les dix captures
de phase 04 ont été relues. Le résultat CI GitHub est suivi dans la PR.

## Les onze attentes

1. **EMPLOYEE** : sa fiche liée uniquement ; autre fiche, liste, options,
   référentiels, export et mutation refusés. Parcours Ma fiche vérifié au navigateur.
2. **TECHNICIAN** : lecture professionnelle seule ; téléphone/dates absents
   des sélections SQL, DTO et réponse HTML. Édition, import, export refusés.
3. **Hiérarchie** : cycle direct, trois niveaux, profondeur de 2 001 nœuds
   et deux modifications concurrentes refusés ; aucun cycle final en base.
4. **États** : les seize couples état initial/final sont testés ; retours
   interdits refusés. Parti → En arrivée exige ADMIN et preuve récente.
5. **Référentiels utilisés** : refus détaillé, employés partis compris ;
   compteurs employés/pôles/abonnements/équipements ; concurrence suppression
   et rattachement, version dépassée, changement d'organisation d'un pôle utilisé.
6. **Excel français** : octets Windows-1252, ;, accents et dates JJ/MM/AAAA
   correctement décodés et enregistrés. UTF-8 BOM et séparateur virgule couverts.
7. **500 lignes, trois erreurs** : les trois erreurs sont rapportées ;
   confirmation refusée, aucun employé importé.
8. **Fichier modifié** : refus des octets/options changés, état de base périmé,
   autre session, preuve expirée et rejeu. Une seule confirmation concurrente réussit.
9. **Manager dans le fichier** : résolution même s'il apparaît après son
   collaborateur ; création seulement des référentiels explicitement approuvés.
10. **Départ avec compte actif** : IT_MANAGER laisse le compte actif ; bandeau
    ADMIN. Désactivation ADMIN avec preuve récente, révocation des sessions
    et transaction commune. Refus sur soi-même annule départ/import et référentiels.
11. **Export** : colonnes autorisées seulement, sans téléphone ni searchText,
    statuts français, audit sécurité avec filtres/compteur ; aucune valeur du
    filtre textuel ni donnée exportée dans l'audit.

Les onze attentes sont satisfaites dans les tests exécutés. Les nouveaux
fichiers comptent 111 cas : 59 validations, 13 protections HTTP, 33 intégrations
employés/imports/référentiels, 4 seed et 2 migration. S'ajoutent 12 capacités
et 7 exclusions de champs sensibles dans les suites existantes : **130 tests
Vitest supplémentaires** par rapport aux 464 de phase 03, total 594.

## Compléments

- Recherche sans accents/casse, contenu « fevre », caractères de motif SQL
  littéraux ; backfill SQL comparé au service et index GIN utilisé par un plan
  EXPLAIN avec parcours séquentiel désactivé.
- Départ immédiat ACTIVE → LEFT pour ADMIN/IT_MANAGER, confirmation requise
  dans le formulaire et l'import, date passée, collaborateurs réaffectés,
  audit spécifique ; LEFT → ACTIVE toujours refusé.
- Cohérence pôle/organisation, email normalisé unique, téléphone E.164,
  calendrier strict (année zéro refusée), dates de départ non futures.
- Import : doublons normalisés, cycles, sites inconnus, champs **CLEAR**,
  limites 2 Mio/1 000 lignes, corps HTTP borné avant multipart, origine exacte,
  aucune valeur personnelle dans les preuves et audits.
- Douze cas des nouvelles capacités (quatre rôles × trois capacités),
  refus supplémentaires pour utilisateurs inactifs ; matrice des phases
  précédentes conservée.
- Seed : opt-in strict, refus de toute identité étrangère/modifiée, cinquante
  fiches et hiérarchie valides, idempotence sans écrasement et sans compte créé.
- Au navigateur : création IT_MANAGER avec pôle et téléphone, CRUD d'un
  référentiel libre, invitation préremplie et liaison ADMIN de compte existant.

## Migration

Unique migration ajoutée :
`prisma/migrations/20261127132955_employee_search_text/migration.sql`.
Créée avec Prisma migrate dev --create-only ; ajout du backfill à cette
migration non mergée, puis application avec migrate dev.

`searchText` est d'abord nullable, rempli pour les lignes existantes, puis
rendu obligatoire. PostgreSQL normalize(NFD) et les plages Unicode de marques
reproduisent la normalisation du service ; aucune extension unaccent.
pg_trgm, autorisé par le propriétaire, fournit l'opérateur de l'index GIN.

Le second `prisma migrate dev` répond :

```text
Already in sync, no schema change or pending migration was found.
```

Aucune migration supplémentaire. Les quatre index uniques partiels sont
toujours présents et les tests correspondants passent.

## CSV et captures

- [Modèle téléchargeable](examples/employees-template.csv).
- [Fichier d'erreurs réellement envoyé](examples/employee-import-error.csv).
- [Réponse d'aperçu réelle, sans identifiant de preuve](examples/employee-import-preview-error.json) :
  Léa Morel, site inconnu ; Amine Perrin, statut inconnu ; Élodie Martin, ligne valide.
  L'import est entièrement bloqué tant que les deux erreurs persistent.
- Liste : [375 px](screenshots/phase04/employees-mobile.png) /
  [1280 px](screenshots/phase04/employees-desktop.png).
- Fiche : [375 px](screenshots/phase04/employee-detail-mobile.png) /
  [1280 px](screenshots/phase04/employee-detail-desktop.png).
- Import avec erreurs : [375 px](screenshots/phase04/import-errors-mobile.png) /
  [1280 px](screenshots/phase04/import-errors-desktop.png).
- Référentiels : [375 px](screenshots/phase04/references-mobile.png) /
  [1280 px](screenshots/phase04/references-desktop.png).
- Bandeau ADMIN : [375 px](screenshots/phase04/departed-accounts-mobile.png) /
  [1280 px](screenshots/phase04/departed-accounts-desktop.png).

Les identités et adresses de ces preuves sont fictives. Les captures sont
pleine page ; la barre mobile fixe reste visible à la hauteur du viewport.

## Déploiement et limites vérifiées

La procédure propriétaire est dans [EMPLOYEE-IMPORT.md](EMPLOYEE-IMPORT.md) :
reprendre la location Nginx d'import, vérifier nginx -t, puis recharger.
Aucun nouveau service ni collecteur. Le plafond général reste 1 Mio ;
les deux POST d'import acceptent une enveloppe de 3 Mio, sans buffering disque.

Test Nginx 1.30.0 local : syntaxe valide ; transfert de 2 098 176 octets
avec Content-Length puis chunked : HTTP 200 dans les deux cas. Import de
3 Mio + 1 octet : 413 ; autre route de 1 Mio + 1 octet : 413.
Zéro fichier de corps temporaire et zéro avertissement de buffering disque.
Le serveur de test, ses requêtes et son conteneur sont locaux et temporaires.

pg_trgm doit être disponible pour PostgreSQL 17 et activable dans la base
par le rôle de migration ; voir [EMPLOYEES.md](EMPLOYEES.md).
Seule nouvelle variable : `HARNOIS_ALLOW_DEMO_SEED`, facultative, exacte
valeur true et exclusivement local/staging. Sans opt-in, le seed refuse.

## Écarts et limites

- pg_trgm est l'ajout autorisé pour l'index de contenu ; la suppression des
  accents reste dans le service. Aucun autre changement de schéma.
- Service commun pour les trois référentiels : évite de dupliquer verrous,
  accès et audits, tout en conservant les validations et comptages propres.
- L'empreinte d'aperçu couvre largement l'état employé/référentiels/comptes
  liés : une modification indépendante peut demander de refaire l'aperçu.
- Aucun changement serveur, workflow ou paramètre du dépôt. Le staging HTTPS,
  le navigateur mobile physique, Safari, Firefox et lecteur d'écran n'ont pas
  été revalidés. Aucun export depuis Microsoft Excel réel, aucune mesure de
  charge à grande échelle. Les données de test sont entièrement fictives.
- Les dépendances n'ajoutent aucune transitive ; alertes npm antérieures
  Effect/Prisma et minimatch maintenues sans résolution forcée (voir PROGRESS).
- Le serveur Next de développement peut signaler un flux interrompu lors
  des navigations Playwright ; aucun échec fonctionnel ni erreur JavaScript
  de page dans les parcours retenus. Avertissements de couleur terminal,
  API Web Crypto expérimentales de l'outillage et pg déjà documentés conservés.
