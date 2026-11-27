# Équipements, assignations et documents

## Accès

ADMIN et IT_MANAGER gèrent le parc, les catégories, les fournisseurs, les imports
et les exports. TECHNICIAN gère le matériel et ses mouvements, lit les référentiels
et génère les documents. Son prix d'achat est exclu des sélections de lecture et
des réponses ; il ne peut pas écrire ce champ ni importer/exporter le parc.

EMPLOYEE consulte « Mon matériel », ses assignations et son historique. Une fiche
d'équipement n'est ouverte que pendant son assignation active. L'historique
personnel conserve les restitutions sans exposer les détenteurs suivants ni le
statut actuel d'un équipement restitué. Le scan et les documents sont réservés à l'IT.

## États et mouvements

- En stock → assigné : assignation permanente à un employé non parti.
- En stock → en prêt : assignation temporaire, retour prévu obligatoire et non passé.
- Assigné / en prêt → en stock : retour avec état neuf, bon ou correct.
- Assigné / en prêt → en réparation : retour avec état endommagé.
- Assigné / en prêt → perdu : clôture pour perte, note obligatoire.
- En stock → en réparation, perdu ou réformé : changement explicite avec motif.
- En réparation → en stock, perdu ou réformé : changement explicite avec motif.
- Perdu → en stock, en réparation ou réformé : motif obligatoire ; un matériel
  endommagé ne revient pas directement en stock.
- Réformé : état définitif. Les historiques et la fiche sont conservés.

Une réparation ou une réforme d'un matériel assigné exige son retour préalable.
Le motif d'un changement direct est conservé dans les notes de la fiche ; les
notes de remise et de clôture sont conservées sur l'assignation. Le journal ne
recopie aucun de ces textes libres.

Les services prennent les verrous dans le même ordre : périmètre employés,
inventaire, utilisateur, puis équipement. L'index partiel existant garantit aussi
une seule assignation active. Le départ d'un employé montre son matériel à
récupérer sans le bloquer ni clôturer automatiquement ses assignations.

## Inventaire et caractéristiques

`inventoryNumber` est alimenté par une séquence PostgreSQL. Le service alloue
`HRN-000123` sous verrou et saute les numéros déjà occupés manuellement. Les trous
de séquence après une transaction annulée sont normaux. Le numéro lisible reste
modifiable ; le QR contient l'identifiant immuable.

`searchText` normalise désignation, marque, modèle, numéro de série et inventaire
(minuscules, décomposition Unicode, retrait des marques, espaces). La recherche
applique la même normalisation et échappe les caractères LIKE. L'index GIN utilise
`pg_trgm`, déjà introduit en phase 04. Aucun champ dérivé n'est accepté du client.

Les caractéristiques sont définies par catégorie, héritées de tous les parents :
texte, nombre, oui/non ou choix. Les identifiants restent uniques dans une chaîne.
Un type existant ne change pas. Un champ utilisé ne peut pas disparaître ; le
désactiver conserve sa valeur et interdit de nouvelles saisies. Une modification
de parent/catégorie incompatible avec les caractéristiques existantes est refusée.
Les catégories ont un nom unique dans tout le référentiel, conformément au schéma.

Un référentiel utilisé, même uniquement par un historique ou un matériel réformé,
ne peut pas être supprimé. Le comptage et la suppression s'exécutent sous verrou.

## Import et export CSV

[Modèle téléchargeable](examples/equipment-template.csv) ;
[fichier avec erreurs](examples/equipment-import-error.csv) ;
[aperçu réellement obtenu](examples/equipment-import-preview-error.json).

Colonnes : `numero_inventaire`, `designation`, `categorie`, `marque`, `modele`,
`numero_serie`, `statut`, `etat`, `date_achat`, `prix_achat`, `fin_garantie`,
`amortissement_mois`, `fournisseur`, `site`, `employe_email`, `retour_prevu`.
Les en-têtes désignation et catégorie sont obligatoires. Sur une création, leurs
cellules le sont aussi ; sur une mise à jour, une cellule vide conserve la valeur.

- UTF-8 avec/sans BOM ou Windows-1252 ; séparateur point-virgule ou virgule.
- Maximum 2 Mio, 1 000 lignes ; cellules vides conservées et marqueur `__CLEAR__`.
- Dates ISO ou `JJ/MM/AAAA` ; prix en texte décimal, dont `1 299,90`.
- Statuts/états : codes ou libellés français, sans distinction de casse/accents.
- Numéro d'inventaire renseigné : mise à jour si trouvé, création sinon.
  Numéro vide : toujours une création. Un numéro de série occupé est un conflit,
  jamais un rapprochement automatique.
- Catégorie : nom unique ou chemin `Parent > Enfant`. La création de chaque
  catégorie/fournisseur inconnu exige une approbation. Un site inconnu est refusé.
- Un email d'employé crée l'assignation correspondante. Sans statut renseigné,
  le retour prévu induit un prêt ; sinon l'assignation est permanente.
- Changer le détenteur ou supprimer une assignation exige un retour sur la fiche.
  Retrouver un équipement perdu exige aussi la note de récupération sur sa fiche.
- Aperçu lié aux octets, aux options, à l'état de la base, à l'utilisateur et à sa
  session, valable 15 minutes. Confirmation atomique, consommable une seule fois.
  Aucun fichier ni contenu de ligne n'est stocké dans Verification.
- Les lectures CSV bornées, l'encodage, l'empreinte et le justificatif d'aperçu sont
  partagés avec l'import des employés. Les règles métier restent distinctes.
- Export : mêmes colonnes, filtres courants, libellés français, plafond 10 000 lignes
  avec refus au-delà. Protection des formules CSV et audit sans contenu ni recherche libre.

Le modèle Nginx étend la règle de phase 04 à
`^/api/(employees|equipment)/import/(preview|confirm)$` : corps limité à 3 Mio,
tampon 3 Mio, stockage forcé sur fichier désactivé, buffering de requête désactivé
et délai de réponse 180 secondes. Aucun nouveau logiciel serveur n'est nécessaire.
Régénérer/recharger la configuration selon `docs/AUTHENTICATION.md` ; aucune
configuration du serveur réel n'a été modifiée.

## PDF et QR

PDFKit 0.20.2 et Noto Sans local produisent des fichiers éphémères, sans stockage S3.
Une attestation porte les données actuelles, la date de génération, les dates de
mouvement, les états, les observations et deux emplacements de signature. Une
organisation est obligatoire. Une restitution exige un mouvement clôturé par retour.
Une génération contient les mouvements d'un seul employé (maximum 100).

Les étiquettes L7160 utilisent une page A4, trois colonnes de 63,5 mm, sept lignes
de 38,1 mm, intervalle horizontal 2,5 mm, marges 7,25 mm à gauche et 15,15 mm en haut.
Marges et première position sont réglables ; une étiquette individuelle est aussi
disponible. Maximum 210 équipements distincts par génération.

Imprimer à **100 %**, sans ajustement automatique. Faire un essai sur papier avant
une planche adhésive. L'impression réelle reste à valider sur l'imprimante cible.

Le QR contient `origine(BETTER_AUTH_URL)/equipment/<id>`. Un changement de domaine
exige de réimprimer les étiquettes ou de conserver une redirection de l'ancien domaine.
Le scan refuse tout autre domaine, utilisateur/mot de passe dans l'URL, query,
fragment ou chemin. La caméra utilise ZXing, sans dépendre de BarcodeDetector ;
elle nécessite HTTPS (sauf localhost), une autorisation du navigateur et s'arrête
lorsqu'on quitte la page. Aucune image n'est envoyée au serveur.

Les exemples PDF du dossier `docs/examples` contiennent uniquement des données
fictives et sont produits par les endpoints de l'image Docker de production.
Ils sont destinés à la relecture ; leurs identifiants de test sont nettoyés ensuite.
