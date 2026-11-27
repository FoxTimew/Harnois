# Dépendances de la phase 05

Contrôle du registre npm effectué le 27 novembre 2026. Toutes les nouvelles
versions du verrou sont stables et antérieures au 10 novembre 2026 (date
limite conservée dans `.npmrc`). Aucune résolution transitive forcée.

## Dépendances directes

- `pdfkit@0.20.2` — 30 août 2026.
- `@fontsource/noto-sans@5.3.0` — 19 juillet 2026, polices locales intégrées.
- `@zxing/browser@0.2.1` — 6 juillet 2026.
- `@zxing/library@0.23.0` — 29 avril 2026.
- `@types/pdfkit@0.17.7` — 22 octobre 2026, développement uniquement.

## Nouvelles transitives de PDFKit

- `@noble/ciphers@1.3.0` — 24 avril 2025.
- `@noble/hashes@1.8.0` — 21 avril 2025.
- `fflate@0.8.3` — 16 mai 2026.
- `fontkit@2.0.4` — 9 août 2024.
- `linebreak@1.1.0` — 20 mai 2022.
- `png-js@2.0.0` — 14 avril 2026.
- `base64-js@1.5.1` — 11 novembre 2020.
- `base64-js@0.0.8` — 31 décembre 2014, sous linebreak.
- `brotli@1.3.3` — 8 juin 2022.
- `clone@2.1.2` — 21 mars 2018.
- `dfa@1.2.0` — 17 juin 2019.
- `pako@0.2.9` — 21 juillet 2016.
- `restructure@3.0.2` — 14 juin 2024.
- `tiny-inflate@1.0.3` — 17 novembre 2019.
- `unicode-properties@1.4.1` — 19 juin 2022.
- `unicode-trie@2.0.0` — 17 novembre 2019.

## Nouvelles transitives de ZXing

- `@zxing/text-encoding@0.9.0` — 3 août 2020.
- `ts-custom-error@3.3.1` — 1er novembre 2022.

PDFKit reste externe au bundle serveur (`serverExternalPackages`). Le tracing
inclut ses données de polices standard et les fichiers WOFF Noto Sans regular
et bold. Les PDF ne chargent aucune police sur Internet.
`qrcode@1.5.4`, déjà présent depuis la phase 02, est réutilisé.

Sources de version : métadonnées de publication du registre npm pour chaque
paquet, et [documentation officielle PDFKit](https://pdfkit.org/docs/getting_started.html).
