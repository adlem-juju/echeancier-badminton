/**
 * server.js — Static file server + FFBAD scan relay
 *
 * Serves the app exactly like the previous `python3 -m http.server` setup,
 * plus one API route (`/api/ffbad-scan`) that fetches myffbad.fr server-side.
 * A browser-side fetch to myffbad.fr is blocked by CORS (it sends no
 * Access-Control-Allow-Origin header), so this relay is required — see
 * imports.md for the full investigation.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Ligue Pays de la Loire — cohérent avec le département par défaut (44) de l'app.
const LEAGUE_ID = 21;
// Le raffinement final ne s'applique qu'aux Poussins (scope validé le
// 2026-07-05), mais aucun Poussin n'a de cote officielle numérique — sans
// Benjamin/Minime dans la liste, il n'y a aucun voisin classé pour interpoler
// leur cote. On interroge donc une catégorie plus large pour disposer de ces
// points d'ancrage, et on filtre sur les Poussins seulement à l'usage
// (voir applyFFBadRefinement côté client).
const CATEGORIES = 'Pou1-Pou2-Ben1-Ben2-Min1-Min2';

const RESULT_ROW_PATTERN = /\{\\"Rank\\".*?\\"ThisRank\\":\d+\}/gs;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ffbad-scan', async (req, res) => {
    try {
        const date = new Date().toISOString().slice(0, 10);
        const [hommes, femmes] = await Promise.all([
            fetchRanking(1, date),
            fetchRanking(2, date),
        ]);

        // Benjamin/Minime servent seulement d'ancrage à l'interpolation
        // (voir CATEGORIES ci-dessus) — on ne restitue que les Poussins.
        const cotes = {};
        for (const row of [...hommes, ...femmes]) {
            if (row.licence && row.cote !== null && row.isPoussin) cotes[row.licence] = row.cote;
        }

        res.json({ scannedAt: new Date().toISOString(), cotes });
    } catch (err) {
        console.error('FFBAD scan failed:', err);
        res.status(502).json({ error: 'Échec du scan FFBAD', detail: err.message });
    }
});

async function fetchRanking(disciplineId, date) {
    const url = `https://myffbad.fr/recherche/les-tops?isFirstLoad=false` +
        `&disciplineId=${disciplineId}&maxResults=1000&date=${date}` +
        `&league=${LEAGUE_ID}&categories=${CATEGORIES}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} sur les-tops (discipline ${disciplineId})`);
    }

    const html = await response.text();
    return extractRanking(html);
}

/**
 * The page embeds a React Server Components payload containing one raw JSON
 * object per player (PersonLicence, Rate, ThisRank...) — richer and far more
 * robust to extract than the rendered <table>. See imports.md.
 */
function extractRanking(html) {
    const matches = html.match(RESULT_ROW_PATTERN) || [];
    const rows = [];

    for (const raw of matches) {
        try {
            const obj = JSON.parse(raw.replace(/\\"/g, '"'));
            rows.push({
                licence: obj.PersonLicence,
                cote: obj.Rate === '-' ? null : parseFloat(obj.Rate),
                rank: obj.ThisRank,
                isPoussin: /^Pou/.test(obj.CategoryAcronym || ''),
            });
        } catch {
            // Malformed row, skip it.
        }
    }

    rows.sort((a, b) => a.rank - b.rank);
    interpolateMissingCotes(rows);
    return rows;
}

/**
 * Fills `cote: null` entries by linear interpolation between the nearest
 * ranked neighbours — same rule as (A + B) / 2 for a single gap, ported from
 * code_maison/FFBadRanking.js's _interpolateMissingCotes.
 */
function interpolateMissingCotes(rows) {
    const n = rows.length;
    let firstKnown = -1;
    let lastKnown = -1;
    for (let i = 0; i < n; i++) {
        if (rows[i].cote !== null) {
            if (firstKnown === -1) firstKnown = i;
            lastKnown = i;
        }
    }
    if (firstKnown === -1) return;

    for (let i = 0; i < firstKnown; i++) rows[i].cote = rows[firstKnown].cote;

    let i = firstKnown;
    while (i < n) {
        if (rows[i].cote !== null) {
            let j = i + 1;
            while (j < n && rows[j].cote === null) j++;
            if (j < n && j > i + 1) {
                const a = rows[i].cote;
                const b = rows[j].cote;
                const gap = j - i;
                for (let k = i + 1; k < j; k++) {
                    rows[k].cote = a + (b - a) * ((k - i) / gap);
                }
            }
            i = j;
        } else {
            i++;
        }
    }

    for (let i = lastKnown + 1; i < n; i++) rows[i].cote = rows[lastKnown].cote;
}

app.listen(PORT, () => {
    console.log(`BADM-Optimizer server running on http://localhost:${PORT}`);
});
