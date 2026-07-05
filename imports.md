# Import des joueurs — Raffinement de la cote par défaut (myffbad.fr)

## Objectif

Aujourd'hui, quand un joueur importé n'a pas de points/CPPH valides, le code
(`js/utils.js` → `DEFAULT_POINTS`, utilisé dans `js/modules/import.js`) lui
attribue une valeur fixe de **400**. Cette valeur est trop grossière,
notamment pour les jeunes catégories (poussins, benjamins, minimes) où elle
ne reflète pas leur niveau réel.

Le but de cette fonctionnalité est de remplacer ce 400 générique par la
**vraie cote publiée sur myffbad.fr**, quand elle est disponible, en
utilisant le numéro de licence du joueur comme clé de correspondance.

## Sources de données

Classements "les-tops" de myffbad.fr, ligue 21 (Pays de la Loire),
catégories jeunes, discipline Simple, top 1000 :

- Hommes : `https://myffbad.fr/recherche/les-tops?isFirstLoad=false&disciplineId=1&maxResults=1000&date=YYYY-MM-DD&league=21&categories=Pou1-Pou2-Ben1-Ben2-Min1-Min2`
- Femmes : `https://myffbad.fr/recherche/les-tops?isFirstLoad=false&disciplineId=2&maxResults=1000&date=YYYY-MM-DD&league=21&categories=Pou1-Pou2-Ben1-Ben2-Min1-Min2`

## Filtres disponibles (page `/recherche/les-tops`)

Scan de la page et de ses paramètres effectué le 2026-07-05 (HTML statique +
tests de requêtes réelles).

| Filtre | Paramètre URL | Valeurs |
|---|---|---|
| Discipline | `disciplineId` | `1` Simple Hommes, `2` Simple Dames, `3` Double Hommes, `4` Double Dames, `5` Mixte Hommes, `6` Mixte Dames |
| Date de référence | `date` | `YYYY-MM-DD` |
| Top | `maxResults` | L'UI ne propose que 100/200/500, mais un entier libre est accepté (testé et confirmé avec 1000 et 2000) |
| Ligue | `league` | ID numérique. Liste peuplée dynamiquement en JS (absente du HTML statique) ; 14 ligues identifiées en creusant les données réelles : `12` LIFB (Île-de-France), `18` PACA, `21` PDLL (Pays de la Loire), `23` REUN (La Réunion), `2340` GUAD (Guadeloupe), `3300` GEST (Grand Est), `3301` NAQU (Nouvelle-Aquitaine), `3302` NORM (Normandie), `3303` BOFC (Bourgogne-Franche-Comté), `3304` AURA (Auvergne-Rhône-Alpes), `3305` OCCI (Occitanie), `3306` HFRA (Hauts-de-France), `7` BRET (Bretagne), `8` CVDL (Centre-Val de Loire). Liste probablement non exhaustive (territoires avec peu de joueurs top classés non vus dans l'échantillon : Martinique, Guyane, Corse, Polynésie, Mayotte...). |
| Catégorie (âge) | `categories` (codes courts joints par `-`) | Confirmé sur un large échantillon national : `Pou1`/`Pou2` (Poussin), `Ben1`/`Ben2` (Benjamin), `Min1`/`Min2` (Minime), `Cad1`/`Cad2` (Cadet), `Jun1`/`Jun2` (Junior), `Sen` (Senior), `Vet1` à `Vet4` (Vétéran) — Vet5/Vet6 possibles mais non observés. |
| Classement | `classements` (même syntaxe `-`) — **découvert et testé ce jour, non documenté avant** | `N1`-`N3` (National), `R4`-`R6` (Régional), `D7`-`D9` (Départemental), `P10`-`P12` (Promotion), `-` (non classé). Testé avec `classements=P10-P11-P12` sur la liste jeunes ligue 21 : filtre bien confirmé (655/894 lignes restantes, uniquement P10/P11/P12/-). |
| Comité, Club | `committee`, `club` | Paramètres reconnus par l'API (vus dans les valeurs internes de la page) mais non exposés dans le panneau de filtres de cette page, et non testés. |

Utile pour l'appli : les filtres à gérer côté import/estimation seront donc
`disciplineId` (dérivé du Genre du joueur), `league` (probablement fixé à la
ligue du club organisateur), `categories` (dérivé de la catégorie d'âge du
joueur), et éventuellement `classements` si on veut un jour restreindre par
niveau plutôt que par âge.

## Constats techniques (vérifiés le 2026-07-05)

- **CORS bloquant** : la réponse de myffbad.fr ne contient aucun header
  `Access-Control-Allow-Origin`. Un `fetch()` déclenché depuis le navigateur
  (origine différente) sera donc bloqué. Le scraping doit se faire côté
  Node, hors de l'app, pas en live depuis le navigateur.
- **Page rendue côté serveur (SSR)** : le HTML brut renvoyé par l'URL
  contient déjà les ~1000 lignes du tableau (confirmé par test direct). Pas
  besoin de navigateur headless (Puppeteer), un simple fetch + parsing HTML
  suffit.
- **Découverte importante — un JSON structuré est embarqué dans la page,
  bien plus riche que le `<table>` HTML visible.** La page (Next.js, React
  Server Components) embarque dans son HTML un bloc de données brut
  contenant un objet par joueur avec, entre autres : `PersonLicence`,
  `Rate` / `RealRate` (cote), `SubLevel` (classement N/R/D/P), `CategoryAcronym`
  / `CategoryName`, `ClubAcronym` (= le champ "Sigle" du fichier Excel
  importé), `CommitteeAcronym`, `LeagueAcronym`, `ThisRank` (rang dans la
  liste filtrée demandée). On peut l'extraire par une simple regex +
  `JSON.parse`, **sans DOM parser** (pas besoin de `linkedom`/`jsdom`) —
  plus simple et plus robuste que le parsing du tableau HTML.
  → Recommandation : baser le script de scraping sur cette extraction JSON
  plutôt que sur le parsing DOM de `FFBadRanking.js` (voir point suivant).
- Vérifié : `RealRate` est **toujours identique** à `Rate` — quand
  l'affichage montre "-", `RealRate` vaut aussi "-". myffbad ne fournit donc
  aucune valeur cachée déjà interpolée ; notre propre interpolation
  (au-dessus/en-dessous dans le classement) reste nécessaire.
- **`code_maison/FFBadRanking.js`** (déjà existant dans le repo) parse le
  tableau HTML. Son layout de colonnes (`rank, rankFFBAD, rankFR, name,
  licence, ligue, comité, club, classement, cote, catégorie, action`) a été
  vérifié contre une vraie réponse live et correspond exactement. Il reste
  utile comme référence/fallback, mais l'extraction JSON ci-dessus est
  préférable pour le script définitif (zéro dépendance npm).
- Son interpolation existante (`_interpolateMissingCotes`) comble les "-"
  isolés dans le classement en se basant sur la cote des joueurs classés
  juste au-dessus et juste en dessous — logique à reprendre telle quelle
  (indépendamment de la méthode d'extraction retenue).
- L'échelle des "cote" myffbad (ex: 2312) est cohérente avec l'échelle des
  `points` déjà utilisée dans l'app — substituable directement, sans
  conversion.

## Constats sur le fichier d'import réel (`data/joueurs_simple.xlsx`)

- La colonne **Licence** existe bien dans les exports FFBaD (ex: `07568640`)
  mais n'est **pas extraite** actuellement par `parsePlayersFromArray`
  (`js/modules/import.js`) — à ajouter.
- La colonne **Points simple** est déjà correctement détectée par le code
  existant.
- Piège identifié : la FFBaD elle-même écrit littéralement **"400"** dans sa
  colonne "Points simple" pour désigner un joueur non classé (ce n'est pas
  une valeur qu'on invente, c'est déjà dans le fichier source). Le test
  actuel d'`isDefault` (NaN / vide / ≤ 0) ne détecte donc pas ce cas — il
  faudra explicitement traiter `points === 400` comme "non fiable".

## Règles métier validées avec l'utilisateur

1. Le remplacement par la cote myffbad ne s'applique **que si `points ===
   400`** (le cas "non fiable"). On ne doit jamais écraser une valeur de
   points différente de 400, même si myffbad a une donnée plus fraîche.
2. Si la licence du joueur **n'est trouvée dans aucune des deux listes**
   (top 1000 Hommes / Femmes), on garde 400 tel quel — aucun autre repli
   statistique (pas de "plancher par catégorie").
3. Si la licence **est trouvée mais que myffbad affiche "-"** en guise de
   cote, on déduit sa valeur par interpolation à partir des cotes des
   joueurs classés juste au-dessus et juste en dessous dans le classement
   (mécanisme déjà implémenté dans `FFBadRanking.js`).

## Pipeline retenu

### Étape offline (script Node, exécuté ponctuellement / périodiquement, hors app)

1. Fetcher les 2 URLs (Hommes + Femmes) et extraire le JSON embarqué
   (regex + `JSON.parse`, pas de DOM parser nécessaire — voir constat
   ci-dessus).
2. Appliquer une interpolation (logique équivalente à
   `_interpolateMissingCotes` de `FFBadRanking.js`) sur chaque liste pour
   combler les cotes "-".
3. Construire une table `licence → cote` fusionnant les deux listes.
4. Écrire cette table dans un JSON statique committé dans le repo (ex:
   `data/cote_reference.json`), consommé ensuite par l'app en local (pas
   d'appel réseau live vers myffbad.fr depuis le navigateur).

### Étape app (`js/modules/import.js`, `js/utils.js`)

1. Ajouter l'extraction de la colonne `Licence` dans
   `parsePlayersFromArray`.
2. Élargir la détection "valeur non fiable" pour inclure `points === 400`
   (en plus de NaN / vide / ≤ 0).
3. Quand la valeur est jugée non fiable : chercher la licence dans
   `cote_reference.json`.
   - Trouvée avec une cote → remplacer 400 par cette cote (le joueur n'est
     plus marqué "par défaut").
   - Introuvable → garder 400, comportement inchangé.
4. (Optionnel, à discuter) Distinguer dans l'export/affichage les joueurs
   "400 par défaut faute de mieux" des joueurs "cote reconstituée depuis
   myffbad.fr" (actuellement `js/modules/export.js:112` n'affiche qu'un seul
   état "Oui (400 par défaut)").

## Statut

Conception validée avec l'utilisateur le 2026-07-05, filtres myffbad.fr
recensés le même jour. **Implémentation pas encore commencée** — en attente
de la prochaine session, qui doit aussi couvrir :
- quelles catégories/filtres au-delà des jeunes Pou1/Pou2/Ben1/Ben2/Min1/Min2
  (ligue 21) l'appli doit réellement gérer à l'import (la liste complète des
  filtres possibles est maintenant documentée ci-dessus) ;
- le rendu visuel de cette fonctionnalité dans l'interface.
