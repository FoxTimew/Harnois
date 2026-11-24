# Vérification du correctif Next.js — 24 novembre 2026

## Périmètre et versions

Base : main `f9b1143cd489ccaa838037b3728803e5a31f8227`.
Branche : `chore/deps-next-16.4.6`. Cette livraison précède la phase 02 et
n'implémente aucune fonctionnalité MFA.

- `next@16.4.6` : publié le 9 novembre 2026 à 20:33:38 UTC.
- `@next/eslint-plugin-next@16.4.6` : publié le 9 novembre à 20:22:45 UTC.
- Onze versions modifiées dans le verrou : ces deux paquets, `@next/env` et
  les huit distributions natives `@next/swc-*`, tous en 16.4.6 et tous publiés
  le 9 novembre. Métadonnées vérifiées directement auprès du registre npm.
- Date limite npm : `2026-11-10T00:00:00.000Z`. Elle était auparavant fixée
  au 2 novembre, ce qui excluait les versions explicitement demandées.
- Aucun changement de Prisma, d'Effect ou des autres versions du verrou.
  Aucun override ni modification du code des dépendances.
- Le composant embarqué Next.js `react-is@19.3.0-canary-278794d7-20261002`
  est identique à celui autorisé le 16 novembre. Les autres exceptions
  existantes du verrou restent inchangées.

Références : [publication Next.js 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6),
[registre Next.js](https://registry.npmjs.org/next),
[registre du plugin ESLint](https://registry.npmjs.org/@next%2feslint-plugin-next).

## Effect : présence dans les livrables

Prisma 7.10.1 dépend de `@prisma/config@7.10.1`, qui exige exactement
`effect@3.20.0`. Cette chaîne reste inchangée.

Les deux cibles du Dockerfile ont été construites sous Linux, avec Node 24.13.1,
sans fichier .env ni variable applicative au build :

```sh
docker build --target runtime --tag harnois-deps-next-16.4.6-app .
docker build --target migrate --tag harnois-deps-next-16.4.6-migrate .
```

Résultats de l'inspection à l'intérieur des images :

- **App standalone** : Next.js 16.4.6 présent ; `effect`, `@prisma/config`
  et la CLI `prisma` absents. Aucun marqueur `getTemplateLiteralRegExp`,
  `node_modules/effect/`, `effect/Schema` ou `effect/ParseResult` dans les
  bundles serveur. Le code applicatif n'importe pas Effect.
- **Migrate** : `effect@3.20.0`, `@prisma/config@7.10.1` et `prisma@7.10.1`
  présents. Cette cible embarque les dépendances d'outillage.
- Les deux images s'exécutent sous UID 1000. L'image app a démarré avec les
  seules quatre variables applicatives de test, connectée à `harnois_test` :
  réponses HTTP 200 sur `/`, `/login` et `/api/auth/get-session`.

Les installations locales et les étapes dependencies/builder contiennent
également Effect. La classification npm du verrou ne suffit donc pas à
déterminer le contenu de l'image applicative : celle-ci copie uniquement le
standalone produit par Next.js.

## Effect : fonctionnalité concernée et chemin d'exécution

L'avis [GHSA-7589-6fvf-x4pw](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw)
concerne la compilation d'expressions régulières par `Schema.TemplateLiteral`
avec plusieurs portions de chaîne libres, puis leur application à une entrée
non fiable. Le correctif amont est Effect 3.22.1.

La lecture de `@prisma/config/dist/index.js` montre des schémas `Struct`,
`String`, `Boolean`, `Array`, `NonEmptyString`, `NullOr` et `Any`, évalués avec
`decodeUnknownEither`. Aucun appel à `TemplateLiteral` ou
`TemplateLiteralParser`. Notre `prisma.config.ts` fournit uniquement les
chemins du schéma et des migrations, ainsi que l'URL de connexion du processus.
Ce fichier est chargé par les commandes Prisma ; il ne reçoit pas de corps
de requête HTTP.

Une mesure avec `NODE_V8_COVERAGE`, sans modification des bibliothèques,
a été réalisée séparément sur les commandes réellement utilisées :

```sh
npx prisma generate
npx prisma migrate deploy
```

La seconde commande a utilisé exclusivement la base locale `harnois_test`,
déjà à jour. Pour chacune des deux commandes :

- `parsePrismaConfigShape` : un appel ;
- `parsePrismaConfigInternalShape` : un appel ;
- `Schema.TemplateLiteral` et `TemplateLiteralParser` : zéro appel ;
- `SchemaAST.getTemplateLiteralPattern`, `getTemplateLiteralRegExp` et
  `getTemplateLiteralCapturingRegExp` : zéro appel.

Un processus témoin distinct a créé le schéma de l'avis et essayé une chaîne
courte invalide, sans provoquer de charge excessive. La mesure détecte alors
un appel à `Schema.TemplateLiteral` et à `getTemplateLiteralRegExp` : le zéro
observé sur les commandes Prisma n'est pas dû à une absence d'instrumentation.

**Conclusion bornée** : la fonctionnalité vulnérable n'est pas utilisée dans
le chemin applicatif livré, ni dans les chemins de chargement/validation de
configuration observés pour generate et migrate deploy. Cela ne prouve pas
l'absence d'usage dans toutes les commandes Prisma, Studio, les options
expérimentales ou une future configuration. La mesure migrate deploy ne
couvre pas l'application d'une nouvelle migration puisqu'aucune n'est ajoutée
par ce correctif. Effect 3.20.0 demeure concerné par l'avis.

**Action prévue** : attendre une version stable de Prisma qui embarque Effect
corrigé, respecter les quatorze jours de publication, puis tester à nouveau
génération, migrations et images. Aucune résolution transitive forcée.

## Validation et limites

- Lint et typecheck : réussis.
- Vitest : 96 tests réussis, avec PostgreSQL réel `harnois_test`.
- Build local : réussi avec les seules quatre variables applicatives de CI.
- Playwright : huit tests réussis à 375 et 1280 px, couvrant les parcours
  d'invitation, connexion, sécurité, déconnexion et récupération existants.
- Captures Accueil et Sécurité relues aux deux largeurs : aucune régression
  visible. Pas de modification d'interface dans ce correctif.
- Deux images Docker construites et image app démarrée : résultats ci-dessus.
- Aucun changement de schéma, migration, variable d'environnement ou workflow.
- Audit npm après mise à jour : aucune entrée Next.js ; douze entrées résiduelles,
  trois classées hautes pour la même chaîne Effect/Prisma et neuf modérées
  liées à minimatch. Aucun `npm audit fix` ni override appliqué.
- OAuth réel, Brevo et staging HTTPS non revérifiés par ce correctif.
- Le résultat de CI GitHub doit être lu dans les checks du dernier commit de
  la PR ; les vérifications locales ne le remplacent pas.
