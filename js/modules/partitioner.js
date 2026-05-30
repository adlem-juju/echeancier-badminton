/**
 * partitioner.js — Mathematical partitioning of players into series
 *
 * Implements the FFBaD logigramme:
 *   N < 5   → Axe A (impossible)
 *   5 ≤ N ≤ 9 → Axe B (small tables)
 *   N ≥ 10  → Axe C (find A×8 + B×6 + C×5 = N, maximize A then B, r=0)
 */

/**
 * Given N players, find optimal (t8, pu6, pu5) combination
 * Returns { t8, pu6, pu5, remainder, excluded }
 */
export function findOptimalPartition(N) {
    if (N < 5) {
        return { t8: 0, pu6: 0, pu5: 0, remainder: N, excluded: N, axe: 'A' };
    }

    // Axe B: 5 ≤ N ≤ 9
    if (N <= 9) {
        return solveSmallTable(N);
    }

    // Axe C: N ≥ 10 → find best A×8 + B×6 + C×5 = N with r=0
    return solveLargeTable(N);
}

/**
 * Axe B handler (5 to 9 players)
 */
function solveSmallTable(N) {
    switch (N) {
        case 5: return { t8: 0, pu6: 0, pu5: 1, remainder: 0, excluded: 0, axe: 'B' };
        case 6: return { t8: 0, pu6: 1, pu5: 0, remainder: 0, excluded: 0, axe: 'B' };
        case 7: return { t8: 0, pu6: 1, pu5: 0, remainder: 1, excluded: 1, axe: 'B' }; // retire 1
        case 8: return { t8: 1, pu6: 0, pu5: 0, remainder: 0, excluded: 0, axe: 'B' };
        case 9: return { t8: 1, pu6: 0, pu5: 0, remainder: 1, excluded: 1, axe: 'B' }; // retire 1
        default: return { t8: 0, pu6: 0, pu5: 0, remainder: N, excluded: N, axe: 'A' };
    }
}

/**
 * Axe C handler (N ≥ 10)
 * Find A×8 + B×6 + C×5 = N, maximizing A then B, with r = 0.
 */
function solveLargeTable(N) {
    let best = null;

    const maxA = Math.floor(N / 8);
    for (let a = maxA; a >= 0; a--) {
        const rem8 = N - a * 8;
        const maxB = Math.floor(rem8 / 6);
        for (let b = maxB; b >= 0; b--) {
            const rem6 = rem8 - b * 6;
            if (rem6 % 5 === 0) {
                const c = rem6 / 5;
                // Found a perfect solution (r = 0)
                if (!best || a > best.t8 || (a === best.t8 && b > best.pu6)) {
                    best = { t8: a, pu6: b, pu5: c, remainder: 0, excluded: 0, axe: 'C' };
                }
                // Since we iterate a descending, first found is already max A
                return best;
            }
        }
    }

    // Should never happen for N ≥ 10, but fallback
    if (!best) {
        best = { t8: 0, pu6: 0, pu5: 0, remainder: N, excluded: N, axe: 'C' };
    }
    return best;
}

/**
 * Partition players list into series with full details
 * Input: sorted array of players (descending points)
 * Returns: { series: [ {type, size, label, players} ], excluded: [...], partition }
 */
export function buildSeries(players) {
    const N = players.length;
    const partition = findOptimalPartition(N);

    const series = [];
    let idx = 0;
    let seriesNum = 1;

    // T8s first (strongest players)
    for (let i = 0; i < partition.t8; i++) {
        const seriesPlayers = players.slice(idx, idx + 8);
        series.push({
            type: 'T8',
            size: 8,
            label: `Série ${seriesNum} (T8)`,
            players: seriesPlayers,
            rankStart: idx + 1,
            rankEnd: idx + 8,
        });
        idx += 8;
        seriesNum++;
    }

    // PU6s next
    for (let i = 0; i < partition.pu6; i++) {
        const seriesPlayers = players.slice(idx, idx + 6);
        series.push({
            type: 'PU6',
            size: 6,
            label: `Série ${seriesNum} (PU6)`,
            players: seriesPlayers,
            rankStart: idx + 1,
            rankEnd: idx + 6,
        });
        idx += 6;
        seriesNum++;
    }

    // PU5s last
    for (let i = 0; i < partition.pu5; i++) {
        const seriesPlayers = players.slice(idx, idx + 5);
        series.push({
            type: 'PU5',
            size: 5,
            label: `Série ${seriesNum} (PU5)`,
            players: seriesPlayers,
            rankStart: idx + 1,
            rankEnd: idx + 5,
        });
        idx += 5;
        seriesNum++;
    }

    // Excluded players
    const excluded = players.slice(idx);

    return { series, excluded, partition };
}

/**
 * Process a single category's player list: rank and partition
 */
export function processPlayers(players) {
    // Players are already sorted before being passed here
    // Assign ranks
    players.forEach((p, i) => p.rank = i + 1);

    // Build series
    return buildSeries(players);
}

/**
 * Generate alternative partitions (for scenario B)
 * Try different combinations that still have r=0 but with different T8/PU6/PU5 mix
 */
export function findAlternativePartitions(N) {
    if (N < 5) return [];

    const alternatives = [];
    const maxA = Math.floor(N / 8);

    for (let a = maxA; a >= 0; a--) {
        const rem8 = N - a * 8;
        const maxB = Math.floor(rem8 / 6);
        for (let b = maxB; b >= 0; b--) {
            const rem6 = rem8 - b * 6;
            if (rem6 >= 0 && rem6 % 5 === 0) {
                const c = rem6 / 5;
                alternatives.push({ t8: a, pu6: b, pu5: c, remainder: 0, excluded: 0 });
            }
        }
    }

    return alternatives;
}

/**
 * Generate partitions with 1 or 2 exclusions (for scenario C)
 */
export function findPartitionsWithExclusions(N, maxExcluded = 2) {
    const results = [];

    for (let ex = 1; ex <= maxExcluded; ex++) {
        const reduced = N - ex;
        if (reduced < 5) continue;
        const alts = findAlternativePartitions(reduced);
        for (const alt of alts) {
            results.push({ ...alt, excluded: ex, remainder: ex });
        }
    }

    return results;
}
