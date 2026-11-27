# Validation de la phase 03

Base : main `de1c5ea639d82b9d6183e99e83e42b3c4e9de561`, phase 02 mergée
sur autorisation du propriétaire. Branche : `feat/03-app-foundation`.

## Tests attendus

| Exigence                               | Vérification                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Matrice complète                       | 240 cas indépendants : 4 rôles × 15 ressources × 4 actions                                                                                    |
| Propriété EMPLOYEE                     | 6 ressources, propriétaire distinct/absent, absence d'employé lié                                                                             |
| Dernier ADMIN                          | Deux administrateurs tentent simultanément de se rétrograder ou se désactiver ; une seule opération réussit, un administrateur actif subsiste |
| Preuve récente et interdiction sur soi | Rôle, désactivation et révocation administrative ; réactivation également contrôlée                                                           |
| Désactivation immédiate                | Toutes les sessions supprimées ; ancien cookie refusé ; aucune restauration après réactivation                                                |
| Audit IT_MANAGER                       | Filtrage en base avant liste, compteur, détail et export ; événement de sécurité ou inconnu inaccessible                                      |
| Champs sensibles                       | Chaque champ exclu testé dans objets imbriqués, tableaux et variantes de casse/séparateurs ; lecture des anciens événements nettoyée          |
| Navigation                             | Quatre rôles à 375 et 1280 px ; liens sensibles/futurs absents, accès direct refusé, export API en HTTP 403                                   |

## Compléments

- ADMIN : révocation des sessions d'autrui auditée, sans désactivation,
  interdite sur soi ; refus des autres rôles.
- Sessions personnelles : preuve récente, propriété, session courante,
  révocation de toutes les autres et absence de jetons dans les DTO.
- Activité : huit mises à jour concurrentes n'écrivent qu'une fois, seuil
  59 999 / 60 000 ms, expiration inchangée, absence d'audit et de résurrection.
- Création de session : `lastSeenAt` serveur, champ client ignoré et route
  native de modification fermée.
- Course connexion/désactivation reproduite avec un point d'arrêt avant
  l'insertion : le hook final relit l'état sous verrou, supprime la session
  créée tardivement et refuse la connexion.
- Invitation IT_MANAGER : rôles supérieurs invisibles, révocation/remplacement
  interdits même après expiration ; remplacement des rôles inférieurs autorisé.
- Lien employé : attribution concurrente unique, historique avant/après.
- Export : 10 001 lignes refusées sans troncature ; 10 000 lignes exportées
  indépendamment de la page courante ; événement sécurité avec filtres et compte.
- CSV : formules, espaces/caractères de contrôle initiaux, séparateurs,
  guillemets et sauts de ligne.
- Formats : montant supérieur à la précision des flottants, centime négatif,
  arrondi Decimal, passage aux heures d'été et d'hiver à Paris.
- Interface : filtres persistants dans l'URL, pagination, colonnes masquables,
  modification de rôle/statut, révocation, détail d'audit, téléchargement CSV,
  thèmes mémorisés, panneau/confirmation au clavier, retour du focus, erreurs de
  validation et page 404 française.

Totaux locaux : **464 tests Vitest** dans 14 fichiers, dont 137 précédents et
327 nouveaux ; **26 tests Playwright**, dont 14 précédents et 12 nouveaux.
Les tests d'intégration utilisent exclusivement `harnois_test` en local.
Chaque fixture nettoie ses propres identifiants ; les autres données sont conservées.

## Migration

Lint, typecheck, tests et build vérifiés localement dans un environnement ne
fournissant que DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL et ENCRYPTION_KEY
comme variables applicatives. La CI GitHub est suivie séparément sur la PR.

`20261127103847_session_last_seen/migration.sql`, générée par
`prisma migrate dev --name session_last_seen` :

```sql
ALTER TABLE "Session" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
```

Le second `migrate dev`, immédiatement après l'application, répond :

```text
Already in sync, no schema change or pending migration was found.
```

Aucune migration supplémentaire. Les quatre index partiels restent gérés
par le schéma. Les sessions préexistantes conservent NULL jusqu'à leur prochaine
requête validée : aucune activité historique fictive n'est reconstituée.

## Dépendances

Versions directes ajoutées et dates contrôlées sur le registre npm officiel :

| Paquet                        | Version | Publication UTC |
| ----------------------------- | ------- | --------------- |
| @tanstack/react-table         | 9.3.1   | 12 octobre 2026 |
| sonner                        | 2.0.8   | 9 août 2026     |
| next-themes                   | 0.4.6   | 11 mars 2025    |
| @radix-ui/react-dialog        | 1.3.1   | 12 octobre 2026 |
| @radix-ui/react-alert-dialog  | 1.2.1   | 12 octobre 2026 |
| @radix-ui/react-dropdown-menu | 2.2.1   | 12 octobre 2026 |
| @radix-ui/react-tooltip       | 1.4.1   | 12 octobre 2026 |

49 nouvelles versions distinctes dans le verrou, toutes stables, la plus
récente publiée le 12 octobre 2026 à 21:04:26 UTC. Date limite npm inchangée :
10 novembre 2026. Aucune nouvelle exception transitive ; aucune résolution
Prisma forcée. Les alertes d'outillage déjà documentées restent ouvertes.

## Captures

Six écrans, chacun à 375 et 1280 px, en clair et sombre : **24 captures**.
Les comptes et événements illustrés sont exclusivement des fixtures de test.

| Écran                 | Bureau clair                                              | Bureau sombre                                            | Mobile clair                                             | Mobile sombre                                           |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Mise en page / profil | [Voir](screenshots/phase03/layout-desktop-light.png)      | [Voir](screenshots/phase03/layout-desktop-dark.png)      | [Voir](screenshots/phase03/layout-mobile-light.png)      | [Voir](screenshots/phase03/layout-mobile-dark.png)      |
| Utilisateurs          | [Voir](screenshots/phase03/users-desktop-light.png)       | [Voir](screenshots/phase03/users-desktop-dark.png)       | [Voir](screenshots/phase03/users-mobile-light.png)       | [Voir](screenshots/phase03/users-mobile-dark.png)       |
| Fiche utilisateur     | [Voir](screenshots/phase03/user-detail-desktop-light.png) | [Voir](screenshots/phase03/user-detail-desktop-dark.png) | [Voir](screenshots/phase03/user-detail-mobile-light.png) | [Voir](screenshots/phase03/user-detail-mobile-dark.png) |
| Audit                 | [Voir](screenshots/phase03/audit-desktop-light.png)       | [Voir](screenshots/phase03/audit-desktop-dark.png)       | [Voir](screenshots/phase03/audit-mobile-light.png)       | [Voir](screenshots/phase03/audit-mobile-dark.png)       |
| Sécurité et sessions  | [Voir](screenshots/phase03/security-desktop-light.png)    | [Voir](screenshots/phase03/security-desktop-dark.png)    | [Voir](screenshots/phase03/security-mobile-light.png)    | [Voir](screenshots/phase03/security-mobile-dark.png)    |
| Composants            | [Voir](screenshots/phase03/ui-desktop-light.png)          | [Voir](screenshots/phase03/ui-desktop-dark.png)          | [Voir](screenshots/phase03/ui-mobile-light.png)          | [Voir](screenshots/phase03/ui-mobile-dark.png)          |

## Limites et choix validés

- Pas de nouvelles variables d'environnement ; aucune modification de workflow
  ou du serveur. Les fonctionnalités des phases métier restent hors périmètre.
- Page `/forbidden` stable avec HTTP 200 final ; API réellement en 403.
- Le lien employé est éditable ; sa destination détaillée n'est pas publiée
  avant le module Employés, afin de ne pas créer de lien mort.
- Jusqu'à quatre entrées mobiles disponibles, sans remplir artificiellement
  la barre avec des modules non développés.
- Chromium automatisé, sans test manuel supplémentaire sur téléphone physique,
  Safari, Firefox, lecteur d'écran, ni serveur HTTPS du propriétaire.
- Les vérifications matérielles et services externes laissées ouvertes en phase 02
  restent inchangées. La YubiKey physique n'a pas été retestée pour cette phase.
- Le serveur Next en développement peut signaler « destination stream errored »
  lors des navigations interrompues par les tests ; aucune erreur JavaScript
  navigateur ni échec de parcours correspondant n'a été constaté.
