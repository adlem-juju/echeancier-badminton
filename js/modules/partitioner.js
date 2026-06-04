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
 * findForcedPartition: Used when the user specifies EXACTLY how many to exclude (e.g. 0).
 * Attempt to partition N into sizes 8, 7, 6, 5, 4 with remainder 0.
 * To maximize matches for all players, we evaluate all possible combinations
 * and prefer the one that maximizes the MINIMUM number of matches guaranteed to any player,
 * breaking ties by average matches.
 */
export function findForcedPartition(N) {
    if (N < 4) return [{ t8: 0, pu7: 0, pu6: 0, pu5: 0, pu4: 0, pu3: 0, remainder: N, excluded: N, axe: 'Forced-Fail' }];

    const sizes = [8, 7, 6, 5, 4]; // PU3 temporarily removed
    const minMatchesMap = { 8: 3, 7: 6, 6: 5, 5: 4, 4: 3 };
    const totalMatchesMap = { 8: 8 * 3, 7: 7 * 6, 6: 6 * 5, 5: 5 * 4, 4: 4 * 3 }; // Approximate for tie-breaking

    const validCombinations = [];

    // Collect all valid combinations
    function backtrack(target, counts, index) {
        if (target === 0) {
            validCombinations.push({ ...counts });
            return;
        }
        if (target < 0 || index >= sizes.length) return;

        const size = sizes[index];
        const maxCount = Math.floor(target / size);

        // Explores all counts from maxCount down to 0
        for (let c = maxCount; c >= 0; c--) {
            counts[`s${size}`] = c;
            backtrack(target - c * size, counts, index + 1);
        }
        counts[`s${size}`] = 0;
    }

    const counts = { s8: 0, s7: 0, s6: 0, s5: 0, s4: 0 };
    backtrack(N, counts, 0);

    if (validCombinations.length > 0) {
        // Evaluate, score and sort all valid combinations
        const scoredCombos = validCombinations.map(combo => {
            let comboMinMatches = Infinity;
            let comboTotalMatches = 0;

            for (const s of sizes) {
                if (combo[`s${s}`] > 0) {
                    if (minMatchesMap[s] < comboMinMatches) comboMinMatches = minMatchesMap[s];
                    comboTotalMatches += combo[`s${s}`] * totalMatchesMap[s];
                }
            }

            // Score prioritizing T8 and PU6 formats as requested by user
            const score = (combo.s8 * 100000) + (combo.s6 * 10000) + (comboMinMatches * 1000) + comboTotalMatches;
            return { combo, score };
        });

        // Sort descending by score
        scoredCombos.sort((a, b) => b.score - a.score);

        return scoredCombos.map(item => ({
            t8: item.combo.s8,
            pu7: item.combo.s7,
            pu6: item.combo.s6,
            pu5: item.combo.s5,
            pu4: item.combo.s4,
            pu3: 0,
            remainder: 0,
            excluded: 0,
            axe: 'Forced'
        }));
    }

    // Fallback if mathematically impossible
    return [{ t8: 0, pu7: 0, pu6: 0, pu5: 0, pu4: 0, pu3: 0, remainder: N, excluded: N, axe: 'Forced-Fail' }];
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
    const valid = [];
    const maxA = Math.floor(N / 8);
    for (let a = maxA; a >= 0; a--) {
        const rem8 = N - a * 8;
        const maxB = Math.floor(rem8 / 6);
        for (let b = maxB; b >= 0; b--) {
            const rem6 = rem8 - b * 6;
            if (rem6 % 5 === 0) {
                const c = rem6 / 5;
                // Found a perfect solution (r = 0)
                valid.push({ t8: a, pu6: b, pu5: c, remainder: 0, excluded: 0, axe: 'C' });
            }
        }
    }

    if (valid.length > 0) return valid;
    // Should never happen for N ≥ 10, but fallback
    return [{ t8: 0, pu6: 0, pu5: 0, remainder: N, excluded: N, axe: 'C' }];
}

/**
 * Partition players list into series with full details
 * Input: array of players, configuration
 * Returns: { series: [ {type, size, label, players} ], excluded: [...], partition }
 */
export function buildSeries(players, pResult) {
    const series = [];
    let idx = 0;
    let seriesNum = 1;

    const sizes = [
        { key: 't8', type: 'T8', size: 8 },
        { key: 'pu7', type: 'PU7', size: 7 },
        { key: 'pu6', type: 'PU6', size: 6 },
        { key: 'pu5', type: 'PU5', size: 5 },
        { key: 'pu4', type: 'PU4', size: 4 },
        { key: 'pu3', type: 'PU3', size: 3 }
    ];

    for (const sizeInfo of sizes) {
        const count = pResult[sizeInfo.key] || 0;
        for (let i = 0; i < count; i++) {
            const seriesPlayers = players.slice(idx, idx + sizeInfo.size);
            series.push({
                type: sizeInfo.type,
                size: sizeInfo.size,
                label: `Série ${seriesNum} (${sizeInfo.type})`,
                players: seriesPlayers,
                rankStart: idx + 1,
                rankEnd: idx + sizeInfo.size,
            });
            idx += sizeInfo.size;
            seriesNum++;
        }
    }

    return { series, partition: pResult };
}

/**
 * Process a single category's player list: apply exclusion rules, rank, and partition
 */
export function processPlayers(players, config = { targetDept: '44', mode: 'auto', forcedExcludedCount: 0 }) {
    const N = players.length;
    let k = 0; // Number of players to exclude
    let pResult;

    let validPartitions = [];

    if (config.mode === 'forced') {
        k = config.forcedExcludedCount;
        if (k > N) k = N;
        const remaining = N - k;
        // findForcedPartition now returns an array of all valid sorted combinations
        validPartitions = findForcedPartition(remaining);
        validPartitions.forEach(fp => {
            fp.excluded = k;
            fp.remainder = k;
        });
    } else {
        // Auto
        if (N < 5) {
            validPartitions = [{ t8: 0, pu6: 0, pu5: 0, remainder: N, excluded: N, axe: 'A' }];
        } else if (N <= 9) {
            validPartitions = [solveSmallTable(N)];
        } else {
            validPartitions = solveLargeTable(N);
        }

        // Ensure k is determined by the automatically selected partition
        const bestPartition = validPartitions[0];
        k = bestPartition.excluded;
    }

    const partitionIdx = (config.partitionIndex || 0) % Math.max(1, validPartitions.length);
    pResult = validPartitions[partitionIdx];

    // --- Exclusion Logic ---
    // Sort entire player list by EXCLUSION PRIORITY (descending)
    // 1. Out of department (if targetDept provided) -> excluded first
    // 2. Date -> newest (highest timestamp) excluded first
    // 3. Fallback to points (lowest first)
    const sortedForExclusion = [...players].sort((a, b) => { // b - a for descending priority
        const aOut = config.targetDept ? !a.sigle.endsWith(config.targetDept) : false;
        const bOut = config.targetDept ? !b.sigle.endsWith(config.targetDept) : false;
        if (aOut !== bOut) return aOut ? -1 : 1;

        // Both same dept status, sort by date descending (latest timestamp = excluded first)
        if (a.dateAdded !== b.dateAdded) return b.dateAdded - a.dateAdded;

        // Fallback to points (lowest CPPH = excluded first)
        return a.points - b.points;
    });

    const excluded = sortedForExclusion.slice(0, k);
    const keptPlayers = sortedForExclusion.slice(k);

    // Keepers are then sorted by Points (descending) to build series
    keptPlayers.sort((a, b) => b.points - a.points);

    // Assign definitive ranks
    keptPlayers.forEach((p, i) => p.rank = i + 1);

    // Build the series
    const result = buildSeries(keptPlayers, pResult);
    result.excluded = excluded;
    result.validPartitionsCount = validPartitions.length;
    result.currentPartitionIndex = partitionIdx;
    return result;
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
