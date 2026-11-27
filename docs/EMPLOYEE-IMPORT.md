# Import et export des employés

## Modèle

Téléchargement authentifié : `GET /api/employees/import/template`.
[Modèle CSV](examples/employees-template.csv), UTF-8 avec BOM, point-virgule.
Les lignes d'exemple doivent être adaptées aux référentiels de la base.

```csv
email;prenom;nom;telephone;poste;statut;date_arrivee;date_depart;organisation;pole;site;manager_email
celine.lefevre@example.invalid;Céline;Lefèvre;;Responsable support;En arrivée;15/01/2027;;Harnois Démonstration;Informatique;Siège Démonstration;
```

Email, prénom et nom sont obligatoires sur chaque ligne, y compris une mise
à jour. L'email normalisé identifie la fiche ; un changement d'email se fait
sur la fiche, car un nouvel email dans le CSV crée une autre personne.
Les autres colonnes sont facultatives. Colonnes inconnues, répétées et
doublons d'email normalisé dans le fichier sont refusés.

| Colonne                   | Valeur                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| email                     | Adresse normalisée par trim + minuscules                                                              |
| prenom, nom               | Texte non vide, 120 caractères maximum                                                                |
| telephone                 | Numéro international avec +, valide et sans extension ; stocké en E.164                               |
| poste                     | Texte, 160 caractères maximum                                                                         |
| statut                    | En arrivée, Actif, En départ, Parti, ou ONBOARDING/ACTIVE/OFFBOARDING/LEFT ; casse et accents ignorés |
| date_arrivee, date_depart | JJ/MM/AAAA ou AAAA-MM-JJ, date de calendrier stricte                                                  |
| organisation              | Nom exact, après suppression des espaces en bordure                                                   |
| pole                      | Nom exact dans l'organisation explicitement indiquée sur la ligne                                     |
| site                      | Nom exact d'un site existant ; aucune création implicite                                              |
| manager_email             | Email du manager en base ou ailleurs dans le fichier                                                  |

Une cellule vide ou une colonne absente conserve la valeur existante lors
d'une mise à jour. À la création, elle donne null, sauf statut : En arrivée.
`__CLEAR__` efface explicitement un champ facultatif ; il est interdit sur
email, prénom, nom et statut. Pour effacer l'organisation d'un employé ayant
un pôle, effacer aussi le pôle. Un manager parti ne peut être choisi.
Les statuts affichés dans le modèle, l'aperçu et l'export sont français.

## Les sept étapes

1. Télécharger le modèle et lire les règles de colonnes.
2. Sélectionner un CSV, **2 Mio maximum et 1 000 lignes de données**.
3. Lire le fichier en mémoire : détection ; ou , par reconnaissance des en-têtes ;
   UTF-8 strict d'abord, puis Windows-1252. L'encodage peut être forcé avant aperçu.
4. Vérifier chaque ligne : création, mise à jour, inchangée ou erreurs par champ.
   Le fichier reste en mémoire du navigateur ; aucun stockage persistant.
5. Approuver explicitement chaque organisation/pôle inconnu. Les sites inconnus
   restent des erreurs à corriger. Les noms sont appariés exactement.
6. Confirmer les départs immédiats, et éventuellement la désactivation des comptes
   pour ADMIN après preuve récente. Un retour Parti → En arrivée exige aussi
   une preuve récente et ADMIN. Tout est enregistré ou tout est annulé.
7. Lire le bilan des créations, mises à jour et fiches inchangées.

L'aperçu expire au bout de 15 minutes. Il appartient à l'utilisateur **et à
sa session** ; une autre session ne peut le confirmer. Le serveur conserve
dans Verification uniquement des empreintes, les options et l'expiration.
Le fichier est retransmis à la confirmation : ses octets et options sont
comparés, puis tout est revalidé sous verrous. Le justificatif est consommé
atomiquement, sans rejeu.

L'empreinte de l'état de référence est volontairement conservatrice : toute
modification des fiches/référentiels pris en compte depuis l'aperçu demande un
nouvel aperçu, même si elle concerne une autre ligne. Cela évite un accord
de l'utilisateur sur un plan différent. Une erreur ou un refus ne crée
aucun référentiel et aucun employé.

Une cellule trop volumineuse, un CSV syntaxiquement incomplet ou un encodage
non pris en charge bloque la lecture du fichier. Les limites comprennent
16 K caractères par enregistrement et 64 Kio pour les métadonnées de confirmation.
UTF-16, numéros de série de dates Excel et séparateurs mixtes ne sont pas acceptés.

## Sécurité et audit

ADMIN/IT_MANAGER uniquement ; chaque endpoint appelle requireUser et les services
revérifient la session, la MFA et les droits. Les POST exigent l'origine exacte.
Le flux HTTP est borné à 3 Mio avant l'analyse multipart, puis le fichier à 2 Mio.
Pas de fichier temporaire sur le serveur applicatif, pas de données CSV dans
les logs. Les réponses sont no-store et no-referrer.

La confirmation crée des audits métier par fiche modifiée, des événements
distincts pour les changements d'état/départs immédiats et un bilan d'import.
Seuls noms de champs, états et compteurs sont enregistrés, sans valeurs personnelles.
La désactivation de compte conserve son audit de sécurité séparé.

L'export ADMIN/IT_MANAGER porte sur toute la sélection filtrée, pas seulement
la page. Plafond **10 000 lignes**, avec refus au-delà ; jamais de troncature.
Colonnes : email, prenom, nom, poste, statut, date_arrivee, date_depart,
organisation, pole, site, manager_email. Le téléphone, searchText et les données
d'authentification sont exclus. UTF-8 BOM, ;, cellules échappées et formules neutralisées.
L'audit de sécurité inclut nombre de lignes, colonnes, filtres structurés et
`searchUsed` ; jamais la valeur du filtre textuel ni le contenu exporté.

## Nginx : installation par le propriétaire

Le modèle `docker/nginx/harnois.conf.template` ajoute une seule location pour
`/api/employees/import/preview` et `/api/employees/import/confirm` :

```nginx
client_max_body_size 3m;
client_body_buffer_size 3m;
client_body_in_file_only off;
proxy_request_buffering off;
proxy_http_version 1.1;
proxy_buffering off;
proxy_read_timeout 180s;
```

Les en-têtes Host et d'adresse IP sont réécrits comme dans la location générale.
Le plafond général des autres requêtes reste 1 Mio. L'enveloppe multipart de
3 Mio laisse une marge autour du CSV de 2 Mio. Le buffering des requêtes est
désactivé, y compris pour l'envoi chunked vers l'amont HTTP/1.1.

Aucun nouveau collecteur, service systemd ou paquet npm n'est nécessaire sur
le serveur. L'opérateur régénère la configuration avec ses chemins existants :

```bash
node scripts/render-nginx.mjs \
  --url https://inventory.atlasv.io \
  --upstream 127.0.0.1:3000 \
  --cert /chemin/fullchain.pem --key /chemin/privkey.pem \
  > /tmp/harnois.conf

# Après comparaison avec la configuration TLS réellement installée :
sudo install -o root -g root -m 0644 /tmp/harnois.conf /etc/nginx/sites-available/harnois
sudo nginx -t && sudo systemctl reload nginx
```

Adapter le port à APP_PORT et conserver les permissions/rotation de journaux
décrites dans AUTHENTICATION.md. Ne pas lancer de reload si nginx -t échoue.
Ces commandes sont à exécuter par le propriétaire ; l'agent ne modifie pas le serveur.
