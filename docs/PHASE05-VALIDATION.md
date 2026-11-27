# Validation de la phase 05

Validation locale du 27 novembre 2026, Node 24.13.1, PostgreSQL 17, Chromium.
Branche `feat/05-equipment`, issue de `main` (`33a6e68`). La durée de la CI et
la comparaison finale sont données dans la PR et le rapport de livraison.

## Contrôles

- `lint`, `typecheck`, `test`, `build` exécutés avec `CI=true` et uniquement les
  quatre variables applicatives de CI. Aucun secret de service externe nécessaire.
- **686 tests Vitest**, 21 fichiers : tous réussis. Configuration Vitest inchangée.
- **44 parcours Playwright** : tous réussis, à 375 et 1280 px. Le passage complet
  a validé 38 parcours ; six anciennes assertions attendaient encore l'absence
  du lien Équipements. Après leur mise à jour, les six ont réussi (34,1 s).
- Total : **730 cas automatisés**. Dont 24 tests d'intégration équipements,
  16 cas unitaires équipements, 32 nouvelles combinaisons de matrice, 20 cas de
  capacités et huit parcours e2e nouveaux : **100 cas supplémentaires**.
- La matrice compte désormais 272 combinaisons CRUD (4 rôles × 17 ressources ×
  4 actions), avec 52 tests complémentaires dans le fichier de permissions.
- Erreur TypeScript volontaire : `TS2322`, sortie non nulle de `npm run typecheck` ;
  fichier retiré, contrôle revenu au vert. La commande reste inchangée et bloquante.

## Les neuf attentes du plan

1. **Double assignation simultanée : OK.** Deux transactions concurrentes ; une
   seule réussit, une seule assignation active reste en base.
2. **Deux créations simultanées : OK.** Numéros et tags distincts. Un tag occupé
   manuellement à la prochaine valeur de séquence est sauté.
3. **Prix absent pour TECHNICIAN : OK.** Absence dans les DTO et la réponse HTTP,
   écriture du prix et export refusés ; formulaire sans champ financier.
4. **EMPLOYEE limité à son matériel : OK.** Fiche d'autrui refusée, liste générale
   et scan refusés ; historique personnel sans identité des détenteurs suivants.
5. **Transitions interdites : OK.** Réforme d'un matériel assigné refusée, état
   réformé définitif ; perte et récupération avec motif, retour endommagé en réparation.
6. **Cycles de catégories : OK.** Cycle indirect refusé ; suppression d'une
   catégorie utilisée refusée, y compris en concurrence avec un rattachement.
7. **Import : OK.** Prix français exact `1299.90`, assignation créée, reçu consommé
   une fois. Octets altérés, autre session, aperçu expiré et base modifiée refusés.
   Une erreur parmi des lignes valides annule toute la confirmation.
8. **QR et accès scan : OK.** URL construite avec l'identifiant immuable ; URLs
   externes, informations de connexion, query et fragment refusés. Accès EMPLOYEE
   refusé. Un QR réellement extrait du PDF de production a été décodé avec ZXing
   et comparé à l'identifiant de la fixture.
9. **Attestations : OK.** PDF réel, modèle contenant les données actuelles et
   mouvements ; audit de génération sans contenu personnel. Génération refusée
   sans organisation, restitution générée après retour. Production vérifiée ci-dessous.

Compléments : caractéristiques héritées et types immuables, conservation des
champs désactivés, refus des clés dangereuses, concurrence optimiste, recherche
sans accents, dates/prix invalides, prêt avec échéance obligatoire et modification
auditée, employé parti refusé à l'assignation, fournisseur utilisé non supprimable,
référentiels créés seulement après accord explicite, site inconnu et série en
doublon refusés, import inchangé conservant `updatedAt`, export complet et audité
sans recherche libre, géométrie et marges des étiquettes.

## Migration

`20261127155619_equipment_foundation`, générée avec Prisma puis complétée avant
application pour reprendre les données existantes : normalisation de `searchText`
avant `NOT NULL`, motif `RETURNED` pour les anciens mouvements restitués. Aucun
tag existant n'est changé ; aucune migration déjà mergée n'est modifiée.

Second `prisma migrate dev`, sur `harnois_test` :

```text
Already in sync, no schema change or pending migration was found.
```

Aucune migration supplémentaire, aucune suppression des quatre index partiels.
L'index GIN réutilise `pg_trgm`, prérequis introduit en phase 04.

## Documents produits par l'image de production

Construction du `Dockerfile`, cible `runtime`, image locale `harnois:phase05` :

```text
sha256:8bc4a5ecdce37b13463fb7214902bdf53254b2f0327083ffe9b6884fa1be15ed
```

Conteneur lancé avec quatre variables applicatives, UID **1000**, origine de test
`http://localhost:3045`. Connexion HTTP du compte fictif, session MFA de test,
appels des vrais endpoints `certificate` et `labels`, puis nettoyage de ses données
et suppression du seul conteneur de preuve. Aucune donnée de développement utilisée.

- [Attestation de remise](examples/equipment-handover.pdf) : 12 328 octets,
  trois équipements, une page ; SHA-256
  `e3fc27d8dd04558a1204188ac61985feadd73a003f937a0ec35b877a42de92ed`.
- [Planche L7160](examples/equipment-labels.pdf) : 122 467 octets, 21 étiquettes,
  une page A4 ; SHA-256
  `ed47e579574adbde6ada3f4ab4ea73f0c1df8fdefc7eb0e7eb5a69ccf9252981`.
- Étiquette individuelle aussi générée dans le même conteneur ; QR décodé depuis
  son rendu PNG. Les identifiants fictifs ont été nettoyés : les liens d'exemple
  ne correspondent donc plus à un équipement présent en base.

Rendu PNG de l'attestation et de la planche relu : aucun chevauchement ni texte
coupé. Extraction PDF confirmant « Céline Lefèvre », date du mouvement et signatures.
Une entrée `EQUIPMENT_DOCUMENT_GENERATED` vérifiée en base. Police Noto Sans locale
et données PDFKit présentes dans le standalone ; aucun téléchargement de police.

PDFKit **0.20.2** est externalisé et ses données/polices sont incluses explicitement
dans le traçage Next. Les versions et dates des 23 entrées ajoutées au verrou
figurent dans [DEPENDENCIES_PHASE05.md](DEPENDENCIES_PHASE05.md).

## CSV et captures

- [Modèle final à 16 colonnes](examples/equipment-template.csv).
- [Fichier de démonstration erroné](examples/equipment-import-error.csv) et
  [réponse réelle d'aperçu](examples/equipment-import-preview-error.json) : ligne 2,
  site inconnu ; ligne 3, employé inconnu/parti et montant invalide. Aucune écriture.
- Liste : [375 px](screenshots/phase05/equipment-list-mobile.png),
  [1280 px](screenshots/phase05/equipment-list-desktop.png).
- Fiche et historique : [375 px](screenshots/phase05/equipment-detail-mobile.png),
  [1280 px](screenshots/phase05/equipment-detail-desktop.png).
- Formulaire et caractéristiques : [375 px](screenshots/phase05/equipment-form-mobile.png),
  [1280 px](screenshots/phase05/equipment-form-desktop.png).
- Import avec erreurs : [375 px](screenshots/phase05/import-errors-mobile.png),
  [1280 px](screenshots/phase05/import-errors-desktop.png).
- Scan : [375 px](screenshots/phase05/scan-mobile.png),
  [1280 px](screenshots/phase05/scan-desktop.png).
- Mon matériel : [375 px](screenshots/phase05/my-equipment-mobile.png),
  [1280 px](screenshots/phase05/my-equipment-desktop.png).

Les douze captures ont été relues. Aucun débordement horizontal à ces deux largeurs.

## Performance et limites

Premier commit `ab8231a`, `perf(ci): skip redundant build work` : cache Turbopack
de build désactivé seulement sous `CI=true`, contrôle de types intégré au build
désactivé, commande `typecheck` séparée conservée. Le cache local reste actif.
Vitest, le script du runner et `.github/workflows/` sont inchangés.

Référence PR #6 : job `verify` **23 min 24 s**, étape build **9 min 24,116 s**
(run `46014080342`, groupe à 14:28:04.885Z, fin à 14:37:29Z). Les durées de
compilation, typecheck intégré et écriture du cache se chevauchent : elles ne se
somment pas. Le résultat de la nouvelle CI sera comparé à cette durée de groupe ;
les variations de charge du runner empêchent d'attribuer tout l'écart au seul commit.

Écarts limités : ajout des types PDFKit 0.17.7, stabilisation de l'initialisation
des formulaires partagés révélée par Playwright, récupération d'un équipement perdu
sur sa fiche (note obligatoire absente du CSV). Aucune variable d'environnement ajoutée.

Non vérifiés réellement : caméra Android/iPhone, Safari iOS, scan en HTTPS sur le
staging, impression sur L7160 et marges physiques de l'imprimante. La configuration
Nginx d'import est étendue dans le dépôt ; aucune installation ni modification du
serveur réel effectuée. Pas de validation de charge à grande échelle.
