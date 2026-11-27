# Permissions de Harnois

Matrice de phase 03, complétée pour les employés en phase 04 et le matériel en phase 05. Source exécutable : `src/server/auth/permissions.ts`.
`can(user, action, resource)` est réservé au serveur ; un utilisateur inactif,
une action inconnue ou une ressource inconnue sont refusés.

R = lire, C = créer, U = modifier, A = archiver. « Propre » signifie que
l'identifiant employé vient de la relation en base, jamais de la requête.
« Destinataire » utilise l'identifiant utilisateur de la notification en base.

| Ressource     | ADMIN          | IT_MANAGER                       | TECHNICIAN     | EMPLOYEE                     |
| ------------- | -------------- | -------------------------------- | -------------- | ---------------------------- |
| categories    | R C U A        | R C U A                          | R              | —                            |
| suppliers     | R C U A        | R C U A                          | R              | —                            |
| organizations | R C U A        | R C U A                          | R              | —                            |
| employees     | R C U A        | R C U A                          | R              | R propre                     |
| equipment     | R C U A        | R C U A                          | R C U A        | R propre                     |
| assignments   | R C U A        | R C U A                          | R C U A        | R propre                     |
| software      | R C U A        | R C U A                          | R              | —                            |
| subscriptions | R C U A        | R C U A                          | —              | —                            |
| licenses      | R C U A        | R C U A                          | R              | R propre                     |
| accounts      | R C U A        | R C U A                          | R              | R propre                     |
| invoices      | R C U A        | R C U A                          | —              | —                            |
| tickets       | R C U A        | R C U A                          | R C U A        | R propre, C avec employé lié |
| checklists    | R C U A        | R C U A                          | R C U A        | —                            |
| notifications | R destinataire | R destinataire                   | R destinataire | R destinataire               |
| users         | R U A          | —                                | —              | —                            |
| invitations   | R C A          | R C A pour TECHNICIAN / EMPLOYEE | —              | —                            |
| audit         | R, export      | R, export métier                 | —              | —                            |

## Capacités particulières

- `equipment:import` et `equipment:export` : ADMIN / IT_MANAGER.
- `equipment:documents`, `equipment:labels`, `equipment:scan` : ADMIN / IT_MANAGER / TECHNICIAN.
- Le prix d'achat est exclu des sélections de lecture et des réponses TECHNICIAN
  et EMPLOYEE. Son écriture exige `financials:read`.
- EMPLOYEE : fiche du matériel actuellement attribué, historique propre sans
  détenteur suivant ni état actuel après restitution. Aucun accès à la liste globale.
- Catégories/fournisseurs : suppression physique uniquement lorsqu'inutilisés,
  avec verrou et refus détaillé ; équipement et assignation ne sont jamais supprimés.
- La matrice indépendante vérifie 272 combinaisons rôle/ressource/action,
  complétées par les capacités et les cas de propriété.

La ressource `organizations` couvre organisations, pôles et sites. En phase 04,
la suppression physique concerne uniquement les référentiels sans rattachement ;
un employé n'est jamais supprimé. Le passage à Parti est une mise à jour contrôlée.

- `employees:import` et `employees:export` : ADMIN et IT_MANAGER uniquement.
- `employees:restart` : ADMIN uniquement, avec preuve récente dans le service.
- Lecture EMPLOYEE : identifiant de sa fiche liée, sans annuaire ni options.
- TECHNICIAN : téléphone et dates d'arrivée/départ absents des requêtes et réponses.
- Départ immédiat : ADMIN/IT_MANAGER, confirmation et invariants de départ.
- Désactivation associée : `users:set-active`, ADMIN et preuve récente,
  dans la transaction du départ ; les mêmes refus sur soi/dernier ADMIN s'appliquent.
- Liaison à un compte existant : ADMIN et preuve récente via le service des utilisateurs.
- Audit d'export employés : sécurité ; aucun contenu ni filtre textuel libre.

La navigation conserve invitations et journal métier pour IT_MANAGER sous « Gestion ».
« Administration » reste réservé à ADMIN, et « Référentiels » forme une entrée distincte.

| Capacité               | Règle                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| financials:read        | ADMIN et IT_MANAGER ; retirer les montants des requêtes/DTO des autres rôles |
| licenses:reveal-key    | ADMIN et IT_MANAGER ; jamais de clé dans une lecture ordinaire               |
| tickets:comment        | ADMIN, IT_MANAGER, TECHNICIAN ; EMPLOYEE propriétaire seulement              |
| notifications:read-all | ADMIN seulement, pour l'historique prévu en phase 11                         |
| users:change-role      | ADMIN, preuve récente, interdit sur soi                                      |
| users:set-active       | ADMIN, preuve récente même pour réactiver ; désactivation interdite sur soi  |
| users:reset-mfa        | ADMIN, preuve récente, interdit sur soi ; service de phase 02                |
| users:revoke-sessions  | ADMIN, preuve récente, interdit sur soi ; conserve le compte actif           |
| sessions:revoke        | Ses propres sessions, preuve récente ; une session ou toutes les autres      |
| sessions / read        | Ses propres sessions ; ADMIN peut consulter celles d'autrui                  |
| audit:export           | ADMIN : tout ; IT_MANAGER : événements métier seulement                      |
| ui / read              | ADMIN seulement ; démonstration non publiée dans la navigation               |

Les notifications sont créées par les services : aucun rôle n'obtient C/U/A
depuis le navigateur. `read-all` est distinct de la lecture destinataire,
y compris pour ADMIN.

Pour EMPLOYEE, l'absence d'employé lié refuse toute lecture propriétaire et
toute création de ticket. En phase 09, le service de création fixera
`requesterId = context.user.employeeId` et n'acceptera aucun demandeur fourni
par le navigateur. Commentaires et réouverture ne sont pas implémentés ici.
La révélation de licence et les autres opérations métier sont déclarées, sans
ajouter les fonctionnalités des phases suivantes.

Une invitation est immuable : révoquer puis recréer. IT_MANAGER ne peut ni
lister, ni révoquer, ni remplacer implicitement une invitation ADMIN/IT_MANAGER,
même expirée. La vérification précède toute révocation dans la transaction.

## Application des contrôles

- Chaque page utilise `requirePageUser()`, qui appelle `requireUser()`.
  Chaque mutation et export appelle directement `requireUser()`.
- Les services relisent la session, l'utilisateur actif, sa MFA et les permissions.
  Pour les mutations sensibles, la relecture a lieu après les verrous.
- Un verrou transactionnel commun protège les modifications de rôle/statut.
  Les lignes utilisateur sont verrouillées dans l'ordre de leurs identifiants.
  Un administrateur rétrogradé ou désactivé par une requête concurrente ne peut
  plus terminer sa propre mutation avec ses anciens droits.
- Au moins un ADMIN actif subsiste. Une désactivation révoque les sessions
  dans la même transaction que le changement et son audit.
- Les sessions d'autrui restent consultables uniquement : pas de révocation
  individuelle par ADMIN ; seule la commande explicite « toutes les sessions »
  est ajoutée à la fiche utilisateur.
- Les mises à jour techniques de `lastSeenAt` sont conditionnelles, espacées
  d'au moins une minute, sans prolongation d'expiration ni audit.

## Audit

Le registre central distingue métier et sécurité. Un événement non enregistré
est visible uniquement par ADMIN. Authentification, MFA, fournisseurs,
invitations, utilisateurs, sessions et exports appartiennent à la sécurité.
Le filtrage IT_MANAGER s'applique en SQL avant le comptage, la pagination,
le détail et l'export. Il n'existe aucun annuaire d'auteurs contournant ce filtre :
la recherche auteur accepte son identifiant.

Les écritures utilisent des charges utiles autorisées par action, avec
identifiants, états et valeurs nécessaires uniquement. La liste d'exclusion
récursive supprime secrets, empreintes, jetons, clés, emails et métadonnées
personnelles, aussi lors de la lecture d'anciennes entrées.

L'export porte sur toute la sélection, pas seulement la page visible.
Au-delà de 10 000 lignes, il est refusé et demande d'affiner les filtres.
Les lignes sont lues par lots de 500 dans un instantané cohérent. Encodage
UTF-8 avec BOM, séparateur point-virgule, échappement des guillemets et protection
contre les formules de tableur.
Un export réussi crée `AUDIT_EXPORTED` avec auteur/date, filtres et nombre de
lignes, sans son contenu. Le transport jusqu'au poste n'est pas garanti par
cette entrée : elle atteste la préparation du fichier.

## Navigation et tableaux

`src/lib/navigation.ts` décrit les entrées, leur ordre, leur état `enabled`
et la permission requise. `src/server/auth/navigation.ts` transmet uniquement
les liens autorisés. Une future phase active son entrée lorsque sa page et ses
tests existent. Le mobile présente jusqu'à quatre entrées disponibles et « Plus ».
Les contrôles serveur restent obligatoires même si un lien est masqué.

Exemple :
`/admin/users?q=alice&role=TECHNICIAN&active=true&page=2&pageSize=25&sort=lastLoginAt&order=desc&columns=name,email,role,lastLoginAt`.
Recherche, filtres, tri et pagination sont exécutés en base. Zod borne les
valeurs et autorise seulement les colonnes prévues. L'identifiant départage
les valeurs de tri égales. Le choix des colonnes ne peut pas ajouter de données
absentes du DTO. Le mobile utilise les mêmes lignes sous forme de cartes.

L'accès refusé d'une page redirige vers `/forbidden`, en français
(réponse finale HTTP 200). Les API refusées répondent réellement HTTP 403.
L'option expérimentale Next.js `authInterrupts` n'est pas activée.

## Couverture

Le test tabulaire indépendant vérifie **272 combinaisons** :
4 rôles × 17 ressources × 4 actions. Les tests complémentaires portent sur la
propriété, le destinataire, les rôles invités, les capacités, les utilisateurs
inactifs et la navigation. Voir `PHASE03-VALIDATION.md` pour les résultats.
La phase 04 ajoute douze cas pour les capacités import, export et retour en
arrivée (quatre rôles), ainsi que les refus d'accès et la confidentialité des
services employés : voir [PHASE04-VALIDATION.md](PHASE04-VALIDATION.md).
La phase 05 ajoute les catégories et fournisseurs à la matrice et vingt cas
pour les capacités import, export, documents, étiquettes et scan des équipements :
voir [PHASE05-VALIDATION.md](PHASE05-VALIDATION.md).
