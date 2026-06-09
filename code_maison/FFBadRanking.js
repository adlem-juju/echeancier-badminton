/**
 * FFBadRanking
 * ============
 * Fetches and reconstructs a player ranking table from myffbad.fr.
 * Fills in missing "cote" values by linear interpolation between
 * the nearest ranked neighbours (same logic as the worked example:
 *   cote(N) = (cote(N-1) + cote(N+1)) / 2 )
 *
 * Usage (Node.js ≥ 18 or any modern browser):
 *
 *   const ranking = new FFBadRanking(
 *     'https://www.myffbad.fr/recherche/les-tops' +
 *     '?isFirstLoad=false&disciplineId=1&maxResults=100' +
 *     '&date=2026-06-04&league=21&categories=MBad-Pou1-Pou2-Ben1-Ben2'
 *   );
 *
 *   const players = await ranking.fetch();
 *   console.table(players);
 *
 *   // Export to CSV
 *   const csv = ranking.toCSV();
 *   console.log(csv);
 */

class FFBadRanking {
  /**
   * @param {string} url  Full URL of the myffbad.fr "les-tops" page.
   */
  constructor(url) {
    this.url = url;
    /** @type {Player[]|null} */
    this._players = null;
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /**
   * Fetches the page, parses the ranking table, fills missing cotes,
   * and returns the complete player list.
   *
   * @returns {Promise<Player[]>}
   */
  async fetch() {
    const html = await this._fetchHTML();
    const players = this._parseTable(html);
    this._interpolateMissingCotes(players);
    this._players = players;
    return players;
  }

  /**
   * Returns the last fetched player list (null if fetch() not called yet).
   * @returns {Player[]|null}
   */
  getPlayers() {
    return this._players;
  }

  /**
   * Exports the player list as a CSV string.
   * Calls fetch() automatically if not done yet.
   *
   * @returns {Promise<string>}
   */
  async toCSV() {
    const players = this._players ?? await this.fetch();
    const headers = ['#', 'Prénom Nom', 'Licence', 'Ligue', 'Comité', 'Club',
                     'Classement', 'Cote', 'Cote interpolée', 'Catégorie'];
    const rows = players.map(p => [
      p.rank,
      p.name,
      p.licence,
      p.ligue,
      p.comite,
      p.club,
      p.classement,
      p.cote ?? '',
      p.coteInterpolated ? p.cote : '',
      p.categorie,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Exports the player list as a JSON string.
   * @returns {Promise<string>}
   */
  async toJSON() {
    const players = this._players ?? await this.fetch();
    return JSON.stringify(players, null, 2);
  }

  // ─────────────────────────────────────────────
  // PRIVATE – HTTP
  // ─────────────────────────────────────────────

  /**
   * Fetches the raw HTML of the target URL.
   * Works in both Node.js (native fetch ≥ 18) and browser environments.
   *
   * @returns {Promise<string>}
   */
  async _fetchHTML() {
    const response = await fetch(this.url, {
      headers: {
        // Mimic a real browser to avoid 403/bot-detection responses
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} — ${this.url}`
      );
    }

    return response.text();
  }

  // ─────────────────────────────────────────────
  // PRIVATE – PARSING
  // ─────────────────────────────────────────────

  /**
   * Parses the HTML table and returns a raw player list.
   * Handles both Node.js (via linkedom / jsdom) and browser environments.
   *
   * @param {string} html
   * @returns {Player[]}
   */
  _parseTable(html) {
    // Resolve a DOM document depending on the runtime environment
    const doc = this._parseHTML(html);

    // The ranking table is the first (and only) <table> on the page
    const table = doc.querySelector('table');
    if (!table) {
      throw new Error('No <table> element found in the page. ' +
        'The page may require JavaScript to render. ' +
        'Consider using a headless browser (Puppeteer/Playwright) instead.');
    }

    const players = [];
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 10) return; // Skip malformed rows

      /**
       * Cell layout (0-indexed):
       *  0  – rank (#)
       *  1  – # FFBAD
       *  2  – # FR
       *  3  – Prénom / Nom  (contains flag img + player link or plain text)
       *  4  – Licence
       *  5  – Ligue
       *  6  – Comité
       *  7  – Club
       *  8  – Classement
       *  9  – Cote
       * 10  – Catégorie
       * 11  – Action (ignored)
       */
      const text = (i) => cells[i]?.textContent?.trim() ?? '';
      const rankFFBAD = text(1);
      const rankFR    = text(2);

      // Name: prefer anchor text, fall back to plain text
      const nameAnchor = cells[3]?.querySelector('a');
      const name = nameAnchor
        ? nameAnchor.textContent.trim()
        : text(3).replace(/^[A-Z]{2,3}\s*/, ''); // strip country code artefact

      // Licence: prefer anchor text
      const licenceAnchor = cells[4]?.querySelector('a');
      const licence = licenceAnchor ? licenceAnchor.textContent.trim() : text(4);

      // Ligue / Comité / Club: prefer anchor text
      const linkText = (i) => {
        const a = cells[i]?.querySelector('a');
        return a ? a.textContent.trim() : text(i);
      };

      const coteRaw = text(9);
      const cote = coteRaw !== '' && coteRaw !== '-'
        ? parseFloat(coteRaw)
        : null;

      /** @type {Player} */
      const player = {
        rank:              parseInt(text(0), 10) || players.length + 1,
        rankFFBAD:         rankFFBAD !== '-' ? parseInt(rankFFBAD, 10) : null,
        rankFR:            rankFR    !== '-' ? parseInt(rankFR,    10) : null,
        name,
        licence,
        ligue:             linkText(5),
        comite:            linkText(6),
        club:              linkText(7),
        classement:        text(8) || null,
        cote,
        coteInterpolated:  false,
        categorie:         text(10),
        profileUrl:        nameAnchor?.href ?? null,
      };

      players.push(player);
    });

    return players;
  }

  /**
   * Returns a DOM Document from raw HTML.
   * – Browser: uses DOMParser (built-in).
   * – Node.js: tries linkedom first, then jsdom, then throws a helpful error.
   *
   * @param {string} html
   * @returns {Document}
   */
  _parseHTML(html) {
    // Browser environment
    if (typeof DOMParser !== 'undefined') {
      return new DOMParser().parseFromString(html, 'text/html');
    }

    // Node.js — try linkedom (lightweight)
    try {
      const { parseHTML } = require('linkedom');
      const { document } = parseHTML(html);
      return document;
    } catch (_) { /* not installed */ }

    // Node.js — try jsdom (heavier but widespread)
    try {
      const { JSDOM } = require('jsdom');
      return new JSDOM(html).window.document;
    } catch (_) { /* not installed */ }

    throw new Error(
      'No HTML parser available in this Node.js environment.\n' +
      'Install one of the following: npm install linkedom  OR  npm install jsdom'
    );
  }

  // ─────────────────────────────────────────────
  // PRIVATE – INTERPOLATION
  // ─────────────────────────────────────────────

  /**
   * Fills missing cote values by linear interpolation.
   *
   * For a gap of one player between two known values A and B:
   *   cote = (A + B) / 2
   *
   * For a gap of G consecutive players:
   *   cote(k) = A + (B - A) * (k / (G + 1))   for k = 1..G
   *
   * Edge cases:
   *   – Missing at the start  → copies the first known value downward.
   *   – Missing at the end    → copies the last known value upward.
   *
   * Mutates the array in-place and sets `coteInterpolated = true`
   * on every player whose cote was estimated.
   *
   * @param {Player[]} players
   */
  _interpolateMissingCotes(players) {
    const n = players.length;

    // Find the index of the first and last player with a known cote
    let firstKnown = -1;
    let lastKnown  = -1;
    for (let i = 0; i < n; i++) {
      if (players[i].cote !== null) {
        if (firstKnown === -1) firstKnown = i;
        lastKnown = i;
      }
    }

    // Nothing to do if every cote is missing
    if (firstKnown === -1) return;

    // ── 1. Fill the leading gap (before the first known cote) ──
    for (let i = 0; i < firstKnown; i++) {
      players[i].cote = players[firstKnown].cote;
      players[i].coteInterpolated = true;
    }

    // ── 2. Fill interior gaps by linear interpolation ──
    let i = firstKnown;
    while (i < n) {
      if (players[i].cote !== null) {
        // Look ahead for the next player with a known cote
        let j = i + 1;
        while (j < n && players[j].cote === null) j++;

        if (j < n && j > i + 1) {
          // There are (j - i - 1) consecutive missing entries between i and j
          const coteA = players[i].cote;
          const coteB = players[j].cote;
          const gap   = j - i; // number of steps from A to B

          for (let k = i + 1; k < j; k++) {
            const t = (k - i) / gap;            // 0 < t < 1
            players[k].cote = coteA + (coteB - coteA) * t;
            players[k].coteInterpolated = true;
          }
        }

        i = j; // jump to the next known value
      } else {
        i++;
      }
    }

    // ── 3. Fill the trailing gap (after the last known cote) ──
    for (let i = lastKnown + 1; i < n; i++) {
      players[i].cote = players[lastKnown].cote;
      players[i].coteInterpolated = true;
    }
  }
}

// ─────────────────────────────────────────────
// JSDoc type definition (for IDE auto-complete)
// ─────────────────────────────────────────────

/**
 * @typedef {Object} Player
 * @property {number}      rank               - Position in the ranking (1-based)
 * @property {number|null} rankFFBAD          - National FFBAD rank
 * @property {number|null} rankFR             - National FR rank
 * @property {string}      name               - Full name (Prénom NOM)
 * @property {string}      licence            - Licence number
 * @property {string}      ligue              - League abbreviation (e.g. "PDLL")
 * @property {string}      comite             - Departmental committee (e.g. "CD44")
 * @property {string}      club               - Club abbreviation
 * @property {string|null} classement         - Official level (e.g. "R4", "D7") or null
 * @property {number|null} cote               - Player rating (null before interpolation)
 * @property {boolean}     coteInterpolated   - True when cote was estimated, not official
 * @property {string}      categorie          - Age category (e.g. "Benjamin 1")
 * @property {string|null} profileUrl         - Absolute URL to the player's profile page
 */

// ─────────────────────────────────────────────
// Export (CommonJS + ESM compatible)
// ─────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FFBadRanking;               // CommonJS (Node.js require)
} else if (typeof globalThis !== 'undefined') {
  globalThis.FFBadRanking = FFBadRanking;      // Browser global fallback
}
// ESM users: add  export default FFBadRanking;  or use the global above.
