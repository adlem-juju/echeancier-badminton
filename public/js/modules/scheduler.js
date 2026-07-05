/**
 * scheduler.js — Match scheduling engine
 *
 * Generates rotations respecting:
 *   - Official FFBaD match order for PU5, PU6, and T8 poules
 *   - No double-booking (a player can only play on one court per rotation)
 *   - Rest time constraint between consecutive matches
 *   - Phase dependency for T8 (semis after all pool matches, final after semis)
 *   - SH/SD alternation pattern for rest optimization
 */

import { timeToMinutes, minutesToTime } from '../utils.js';

// ══════════════════════════════════════════
// Official FFBaD match orders
// ══════════════════════════════════════════

/**
 * PU5 — 5 players, 5 tours, 2 matches per tour, 1 exempt
 * Players indexed 1-5 (we'll convert to 0-based)
 */
const PU5_ROUNDS = [
    // Tour 1: 2v4, 3v5, exempt 1
    { matches: [[1, 3], [2, 4]], exempt: 0 },
    // Tour 2: 1v5, 2v3, exempt 4
    { matches: [[0, 4], [1, 2]], exempt: 3 },
    // Tour 3: 1v4, 2v5, exempt 3
    { matches: [[0, 3], [1, 4]], exempt: 2 },
    // Tour 4: 1v3, 4v5, exempt 2
    { matches: [[0, 2], [3, 4]], exempt: 1 },
    // Tour 5: 1v2, 3v4, exempt 5
    { matches: [[0, 1], [2, 3]], exempt: 4 },
];

/**
 * PU6 — 6 players, 5 tours, 3 matches per tour
 * Players indexed 1-6 (0-based)
 */
const PU6_ROUNDS = [
    // Tour 1: 1v6, 2v5, 3v4
    { matches: [[0, 5], [1, 4], [2, 3]] },
    // Tour 2: 1v5, 4v6, 2v3
    { matches: [[0, 4], [3, 5], [1, 2]] },
    // Tour 3: 1v4, 3v5, 2v6
    { matches: [[0, 3], [2, 4], [1, 5]] },
    // Tour 4: 1v3, 2v4, 5v6
    { matches: [[0, 2], [1, 3], [4, 5]] },
    // Tour 5: 1v2, 3v6, 4v5
    { matches: [[0, 1], [2, 5], [3, 4]] },
];

/**
 * PU4 — 4 players, 3 rounds, 2 matches/round (same as a T8 half-pool)
 */
const PU4_ROUNDS = [
    { matches: [[0, 3], [1, 2]] },
    { matches: [[0, 2], [1, 3]] },
    { matches: [[0, 1], [2, 3]] },
];

/**
 * PU7 — 7 players, 7 rounds, 3 matches/round, 1 exempt/round (21 matches total)
 * Generated via the ghost-player (Berger) method: add player 7 as bye, run 8-player
 * round-robin, any "match vs ghost" becomes an exemption.
 */
const PU7_ROUNDS = [
    { matches: [[1, 6], [2, 5], [3, 4]], exempt: 0 },
    { matches: [[2, 0], [3, 6], [4, 5]], exempt: 1 },
    { matches: [[3, 1], [4, 0], [5, 6]], exempt: 2 },
    { matches: [[4, 2], [5, 1], [6, 0]], exempt: 3 },
    { matches: [[5, 3], [6, 2], [0, 1]], exempt: 4 },
    { matches: [[6, 4], [0, 3], [1, 2]], exempt: 5 },
    { matches: [[0, 5], [1, 4], [2, 3]], exempt: 6 },
];

/**
 * T8 — Tableau de 8 joueurs
 * 2 poules de 4 joueurs (Poule A: p1-p4, Poule B: p5-p8)
 * Phase poules: 3 tours, chaque tour = 2 matchs par poule = 4 matchs total
 * Then: 2 demi-finales croisées, then 1 finale
 *
 * Poule de 4 match order:
 *   R1: 1v4, 2v3
 *   R2: 1v3, 2v4
 *   R3: 1v2, 3v4
 */
const T8_POOL_ROUNDS = [
    // Tour 1: Pool A (1v4, 2v3), Pool B (5v8, 6v7)
    { matchesA: [[0, 3], [1, 2]], matchesB: [[4, 7], [5, 6]] },
    // Tour 2: Pool A (1v3, 2v4), Pool B (5v7, 6v8)
    { matchesA: [[0, 2], [1, 3]], matchesB: [[4, 6], [5, 7]] },
    // Tour 3: Pool A (1v2, 3v4), Pool B (5v6, 7v8)
    { matchesA: [[0, 1], [2, 3]], matchesB: [[4, 5], [6, 7]] },
];

// ══════════════════════════════════════════
// Match generation per series
// ══════════════════════════════════════════

/**
 * Generate all matches for a single series
 * Returns array of { round, pairIndices, phase, seriesId, matchLabel }
 */
export function generateSeriesMatches(series, seriesIndex, discipline) {
    const seriesId = `${discipline}_S${seriesIndex + 1}`;
    const matches = [];

    if (series.type === 'PU4') {
        PU4_ROUNDS.forEach((round, roundIdx) => {
            round.matches.forEach(([a, b]) => {
                matches.push({
                    round: roundIdx,
                    pairIndices: [a, b],
                    phase: 'poule',
                    seriesId,
                    seriesType: 'PU4',
                    discipline,
                    playerA: series.players[a],
                    playerB: series.players[b],
                    matchLabel: `${series.players[a].name} vs ${series.players[b].name}`,
                    seriesLabel: series.label,
                });
            });
        });
    } else if (series.type === 'PU5') {
        PU5_ROUNDS.forEach((round, roundIdx) => {
            round.matches.forEach(([a, b]) => {
                matches.push({
                    round: roundIdx,
                    pairIndices: [a, b],
                    phase: 'poule',
                    seriesId,
                    seriesType: 'PU5',
                    discipline,
                    playerA: series.players[a],
                    playerB: series.players[b],
                    matchLabel: `${series.players[a].name} vs ${series.players[b].name}`,
                    seriesLabel: series.label,
                });
            });
        });
    } else if (series.type === 'PU6') {
        PU6_ROUNDS.forEach((round, roundIdx) => {
            round.matches.forEach(([a, b]) => {
                matches.push({
                    round: roundIdx,
                    pairIndices: [a, b],
                    phase: 'poule',
                    seriesId,
                    seriesType: 'PU6',
                    discipline,
                    playerA: series.players[a],
                    playerB: series.players[b],
                    matchLabel: `${series.players[a].name} vs ${series.players[b].name}`,
                    seriesLabel: series.label,
                });
            });
        });
    } else if (series.type === 'PU7') {
        PU7_ROUNDS.forEach((round, roundIdx) => {
            round.matches.forEach(([a, b]) => {
                matches.push({
                    round: roundIdx,
                    pairIndices: [a, b],
                    phase: 'poule',
                    seriesId,
                    seriesType: 'PU7',
                    discipline,
                    playerA: series.players[a],
                    playerB: series.players[b],
                    matchLabel: `${series.players[a].name} vs ${series.players[b].name}`,
                    seriesLabel: series.label,
                });
            });
        });
    } else if (series.type === 'T8') {
        // Pool phase: 3 rounds
        T8_POOL_ROUNDS.forEach((round, roundIdx) => {
            [...round.matchesA, ...round.matchesB].forEach(([a, b]) => {
                matches.push({
                    round: roundIdx,
                    pairIndices: [a, b],
                    phase: 'poule',
                    seriesId,
                    seriesType: 'T8',
                    discipline,
                    playerA: series.players[a],
                    playerB: series.players[b],
                    matchLabel: `${series.players[a].name} vs ${series.players[b].name}`,
                    seriesLabel: series.label,
                });
            });
        });

        // Semi-finals: round 3 (after pool rounds 0-2)
        // Placeholder: 1A vs 2B, 1B vs 2A — we use placeholder names
        matches.push({
            round: 3,
            pairIndices: [-1, -1],
            phase: 'demi',
            seriesId,
            seriesType: 'T8',
            discipline,
            playerA: null,
            playerB: null,
            matchLabel: '1er Poule A vs 2e Poule B',
            seriesLabel: series.label,
        });
        matches.push({
            round: 3,
            pairIndices: [-1, -1],
            phase: 'demi',
            seriesId,
            seriesType: 'T8',
            discipline,
            playerA: null,
            playerB: null,
            matchLabel: '1er Poule B vs 2e Poule A',
            seriesLabel: series.label,
        });

        // Final: round 4
        matches.push({
            round: 4,
            pairIndices: [-1, -1],
            phase: 'finale',
            seriesId,
            seriesType: 'T8',
            discipline,
            playerA: null,
            playerB: null,
            matchLabel: 'Finale',
            seriesLabel: series.label,
        });
    }

    return matches;
}

// ══════════════════════════════════════════
// Schedule builder
// ══════════════════════════════════════════

/**
 * Validate that a generated schedule satisfies all rules.
 * Returns { valid, violations[] }
 */
function validateSchedule(rotations, courts, slotDuration, params) {
    const violations = [];
    const playerLastRot = {};
    const seriesRoundFirstRot = {}; // `${sid}_${round}` -> first rotIdx
    const seriesRoundLastRot = {}; // `${sid}_${round}` -> last rotIdx

    for (const rot of rotations) {
        // Build a "placed slots" list for this rotation (non-null only)
        const placed = rot.slots.filter(Boolean);

        // Check no double-booking within one rotation
        const seenPlayers = new Set();
        for (const slot of placed) {
            for (const p of (slot.players || [])) {
                if (seenPlayers.has(p)) {
                    violations.push(`Double-booking: ${p} in rotation ${rot.index}`);
                }
                seenPlayers.add(p);
            }
        }

        // Check player rest constraint
        for (const slot of placed) {
            for (const p of (slot.players || [])) {
                if (playerLastRot[p] !== undefined) {
                    const gap = rot.index - playerLastRot[p];
                    if (gap < 2) {
                        violations.push(`Rest too short: ${p} played R${playerLastRot[p]} then R${rot.index}`);
                    }
                }
                playerLastRot[p] = rot.index;
            }
        }

        // Track round contiguity data
        for (const slot of placed) {
            if (!slot.match) continue;
            const key = `${slot.seriesId}_${slot.match.round}`;
            if (seriesRoundFirstRot[key] === undefined) seriesRoundFirstRot[key] = rot.index;
            seriesRoundLastRot[key] = rot.index;
        }
    }

    // Check contiguity: all matches of a round must span at most 2 consecutive rotations
    for (const key of Object.keys(seriesRoundFirstRot)) {
        const span = seriesRoundLastRot[key] - seriesRoundFirstRot[key];
        if (span > 1) {
            violations.push(`Contiguity broken: ${key} spans ${span + 1} rotations (R${seriesRoundFirstRot[key]}..R${seriesRoundLastRot[key]})`);
        }
    }

    // Check max idle between rounds (≤ 2 rotations gap = last match round N to first match round N+1 ≤ +3)
    const bySeriesRound = {};
    for (const key of Object.keys(seriesRoundLastRot)) {
        const [sid, roundStr] = key.split(/_(?=[^_]+$)/); // split on last underscore
        const round = Number(roundStr);
        if (!bySeriesRound[sid]) bySeriesRound[sid] = {};
        bySeriesRound[sid][round] = { first: seriesRoundFirstRot[key], last: seriesRoundLastRot[key] };
    }
    for (const [sid, rounds] of Object.entries(bySeriesRound)) {
        const roundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);
        for (let i = 1; i < roundNums.length; i++) {
            const prev = rounds[roundNums[i - 1]];
            const curr = rounds[roundNums[i]];
            const gap = curr.first - prev.last;
            if (gap > 3) {
                violations.push(`Max-idle exceeded: ${sid} round ${roundNums[i - 1]}→${roundNums[i]}: gap=${gap} rotations`);
            }
        }
    }

    return { valid: violations.length === 0, violations };
}

/**
 * Build full schedule from partitions and params.
 * Will retry with different ordering seeds if validation fails (up to 5 attempts).
 * @param {Object} categories - { [catName]: { players, partition } }
 * @param {Object} params - { startTime, courts, matchDuration, warmup, rest }
 * @returns {Object} schedule - { rotations: [...], metrics, violations[] }
 */
export function buildSchedule(categories, params) {
    const slotDuration = params.matchDuration + params.warmup;
    const startMinutes = timeToMinutes(params.startTime);
    const courts = params.courts;
    const courtReduction = params.courtReduction || null;
    const MAX_IDLE = 2;      // Max rotations gap between rounds of a series
    const MAX_RETRIES = 20; // Try many orderings to maximise occupancy

    // Generate all matches for all series
    const allMatchesTemplate = [];
    Object.keys(categories).forEach(catName => {
        const partition = categories[catName].partition;
        if (!partition || !partition.series) return;
        partition.series.forEach((s, idx) => {
            allMatchesTemplate.push(...generateSeriesMatches(s, idx, catName));
        });
    });

    let bestValidResult = null; // best fully-valid result, ranked by occupancy
    let bestResult = null;      // fallback if no valid result found

    // Deterministic pseudo-random hash (for attempt-based permutations)
    const hashInt = (str, seed) => {
        let h = (seed * 2654435761) >>> 0;
        for (let i = 0; i < str.length; i++) {
            h = (Math.imul(h ^ str.charCodeAt(i), 2246822519)) >>> 0;
        }
        return (h ^ (h >>> 16)) >>> 0;
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Deep-clone matches so _placed flags don't bleed between attempts
        const allMatches = allMatchesTemplate.map(m => ({ ...m }));

        // Group by seriesId + round
        const seriesMatchMap = {};
        for (const m of allMatches) {
            if (!seriesMatchMap[m.seriesId]) seriesMatchMap[m.seriesId] = {};
            if (!seriesMatchMap[m.seriesId][m.round]) seriesMatchMap[m.seriesId][m.round] = [];
            seriesMatchMap[m.seriesId][m.round].push(m);
        }

        // Series progress state
        const seriesProgress = {};
        for (const sid of Object.keys(seriesMatchMap)) {
            seriesProgress[sid] = {
                nextRound: 0,
                maxRound: Math.max(...Object.keys(seriesMatchMap[sid]).map(Number)),
                discipline: seriesMatchMap[sid][0][0].discipline,
                seriesType: seriesMatchMap[sid][0][0].seriesType,
                poolsDone: false,
            };
        }

        // Runtime tracking
        const playerLastRot = {}; // player name -> last rotIdx where they played
        const seriesLastRot = {}; // seriesId -> last rotIdx where a match was placed
        const roundDoneAt = {}; // `${sid}_${round}` -> rotIdx completed
        const semiStartedAt = {}; // seriesId -> rotIdx when first demi placed

        // ── DIVERSIFIED ORDERING STRATEGY ──────────────────────────────────────
        // Each attempt uses a genuinely different category ordering so the retry
        // loop explores the scheduling space instead of repeating the same result.
        const catNames = Object.keys(categories).sort();
        const numCats = Math.max(1, catNames.length);
        let orderedCats;

        if (attempt < numCats) {
            // Strategy A: forward cyclic rotation of sorted names
            orderedCats = [...catNames.slice(attempt), ...catNames.slice(0, attempt)];
        } else if (attempt < numCats * 2) {
            // Strategy B: reverse cyclic rotation
            const shift = attempt - numCats;
            const rev = [...catNames].reverse();
            orderedCats = [...rev.slice(shift), ...rev.slice(0, shift)];
        } else if (attempt === numCats * 2) {
            // Strategy C: T8-heavy categories first (pool fills courts early)
            orderedCats = [...catNames].sort((a, b) => {
                const aT8 = (categories[a]?.partition?.series || []).filter(s => s.type === 'T8').length;
                const bT8 = (categories[b]?.partition?.series || []).filter(s => s.type === 'T8').length;
                return bT8 - aT8;
            });
        } else if (attempt === numCats * 2 + 1) {
            // Strategy D: PU6/PU5-first (fills courts around T8 finals)
            orderedCats = [...catNames].sort((a, b) => {
                const aT8 = (categories[a]?.partition?.series || []).filter(s => s.type === 'T8').length;
                const bT8 = (categories[b]?.partition?.series || []).filter(s => s.type === 'T8').length;
                return aT8 - bT8;
            });
        } else if (attempt === numCats * 2 + 2) {
            // Strategy E: by total series count descending (busiest discipline first)
            orderedCats = [...catNames].sort((a, b) => {
                const aLen = (categories[a]?.partition?.series || []).length;
                const bLen = (categories[b]?.partition?.series || []).length;
                return bLen - aLen;
            });
        } else if (attempt === numCats * 2 + 3) {
            // Strategy F: by total series count ascending
            orderedCats = [...catNames].sort((a, b) => {
                const aLen = (categories[a]?.partition?.series || []).length;
                const bLen = (categories[b]?.partition?.series || []).length;
                return aLen - bLen;
            });
        } else {
            // Strategy G: pseudo-random permutation based on attempt seed
            orderedCats = [...catNames].sort((a, b) => hashInt(a, attempt) - hashInt(b, attempt));
        }

        // State for cross-rotation wraparound priority
        let wrapSeriesId = null; // series that started wrapping last rotation
        let wrapDiscipline = null;

        const rotations = [];
        let rotIdx = 0;
        const maxRotations = 100;

        while (rotIdx < maxRotations) {
            // Determine effective court count for this rotation
            let activeCourts = courts;
            if (courtReduction && courtReduction.reduceTo && courtReduction.reduceTo < courts) {
                const fromIdx = (courtReduction.fromRotation || 1) - 1; // convert to 0-based
                const untilIdx = (courtReduction.untilRotation != null) ? courtReduction.untilRotation - 1 : Infinity;
                if (rotIdx >= fromIdx && rotIdx <= untilIdx) {
                    activeCourts = courtReduction.reduceTo;
                }
            }

            const rotation = {
                index: rotIdx,
                timeStart: minutesToTime(startMinutes + rotIdx * slotDuration),
                timeEnd: minutesToTime(startMinutes + (rotIdx + 1) * slotDuration),
                slots: new Array(courts).fill(null),
                activeCourts, // store for rendering
            };
            let courtIdx = 0;
            let anyPlaced = false;

            // ── MANDATORY WRAP CONTINUATION (must start at court 0 if active) ──────
            // If we have a series that wrapped from the previous rotation, it MUST be
            // placed first — at court 0 — before anything else. This guarantees that
            // the continuation always starts on terrain 1 of the new rotation.
            if (wrapSeriesId !== null) {
                const wSid = wrapSeriesId;
                const wSp = seriesProgress[wSid];
                const wRound = wSp.nextRound;
                const wMatches = seriesMatchMap[wSid]?.[wRound];

                if (!wMatches || wSp.nextRound > wSp.maxRound) {
                    // Round already fully placed somehow — clear wrap
                    wrapSeriesId = null; wrapDiscipline = null;
                } else {
                    const unplacedWrap = wMatches.filter(m => !m._placed);
                    if (unplacedWrap.length === 0) {
                        wrapSeriesId = null; wrapDiscipline = null;
                    } else {
                        // Verify that the unplaced wrap matches satisfy player rest
                        // (series rest is skipped since this is same-round continuation)
                        let wOk = true;
                        for (let i = 0; i < unplacedWrap.length && wOk; i++) {
                            const m = unplacedWrap[i];
                            const players = [];
                            if (m.playerA) players.push(m.playerA.name);
                            if (m.playerB) players.push(m.playerB.name);
                            for (const p of players) {
                                if (playerLastRot[p] !== undefined && rotIdx - playerLastRot[p] < 2) {
                                    wOk = false; break;
                                }
                            }
                        }

                        if (wOk) {
                            // Place all remaining wrap matches starting at court 0
                            const toPlaceWrap = unplacedWrap.slice(0, activeCourts - courtIdx);
                            for (const m of toPlaceWrap) {
                                const players = [];
                                if (m.playerA) players.push(m.playerA.name);
                                if (m.playerB) players.push(m.playerB.name);
                                rotation.slots[courtIdx] = {
                                    match: m, players,
                                    label: m.matchLabel, seriesLabel: m.seriesLabel,
                                    seriesId: m.seriesId, phase: m.phase, discipline: m.discipline,
                                };
                                m._placed = true;
                                for (const p of players) playerLastRot[p] = rotIdx;
                                seriesLastRot[wSid] = rotIdx;
                                if (m.phase === 'demi' && semiStartedAt[wSid] === undefined) semiStartedAt[wSid] = rotIdx;
                                courtIdx++;
                                anyPlaced = true;
                            }
                            if (toPlaceWrap.length === unplacedWrap.length) {
                                if (wSp.seriesType === 'T8' && wRound === 2) wSp.poolsDone = true;
                                roundDoneAt[`${wSid}_${wRound}`] = rotIdx;
                                wSp.nextRound++;
                                wrapSeriesId = null; wrapDiscipline = null;
                            }
                            // else: still wrapping, stays as wrapSeriesId for next rotation
                        }
                        // If not ok constraints, skip placing the wrap this rotation too (blank)
                        // Do NOT let other series take court 0 — leave it blank to preserve order
                    }
                }
            }

            // Build discipline order for this rotation.
            // BUGFIX: cycle through orderedCats (not raw catNames) so each attempt
            // actually produces a different per-rotation ordering.
            const offset = rotIdx % numCats;
            let discOrder = [...orderedCats.slice(offset), ...orderedCats.slice(0, offset)];
            if (wrapDiscipline && discOrder.includes(wrapDiscipline)) {
                discOrder = [wrapDiscipline, ...discOrder.filter(d => d !== wrapDiscipline)];
            }
            // Escalate disciplines with series waiting too long
            const urgentDiscs = new Set();
            for (const [sid, sp] of Object.entries(seriesProgress)) {
                if (sp.nextRound > sp.maxRound) continue;
                if (sid === wrapSeriesId) continue;
                const prevKey = `${sid}_${sp.nextRound - 1}`;
                if (sp.nextRound > 0 && roundDoneAt[prevKey] !== undefined) {
                    if (rotIdx - roundDoneAt[prevKey] > MAX_IDLE + 1) urgentDiscs.add(sp.discipline);
                }
            }
            if (urgentDiscs.size > 0) {
                discOrder = [...urgentDiscs, ...discOrder.filter(d => !urgentDiscs.has(d))];
            }

            for (const disc of discOrder) {
                if (courtIdx >= activeCourts) break;

                // Series order within discipline: wrap first, urgent next, then sort by
                // remaining rounds desc (more behind = placed earlier to avoid starvation)
                // then by idle gap desc (waited longer = higher priority).
                let sidsForDisc = Object.keys(seriesProgress)
                    .filter(sid => seriesProgress[sid].discipline === disc)
                    .sort((a, b) => {
                        const spA = seriesProgress[a];
                        const spB = seriesProgress[b];
                        const remA = spA.maxRound - spA.nextRound;
                        const remB = spB.maxRound - spB.nextRound;
                        if (remB !== remA) return remB - remA; // more remaining → first
                        const lastA = roundDoneAt[`${a}_${spA.nextRound - 1}`] ?? -999;
                        const lastB = roundDoneAt[`${b}_${spB.nextRound - 1}`] ?? -999;
                        return lastA - lastB; // waited longer → first
                    });
                if (wrapSeriesId && sidsForDisc.includes(wrapSeriesId)) {
                    sidsForDisc = [wrapSeriesId, ...sidsForDisc.filter(s => s !== wrapSeriesId)];
                }
                const urgentInDisc = sidsForDisc.filter(sid => {
                    const sp = seriesProgress[sid];
                    const prevKey = `${sid}_${sp.nextRound - 1}`;
                    return sid !== wrapSeriesId && sp.nextRound > 0 && roundDoneAt[prevKey] !== undefined
                        && rotIdx - roundDoneAt[prevKey] > MAX_IDLE + 1;
                });
                if (urgentInDisc.length > 0) {
                    sidsForDisc = [...urgentInDisc, ...sidsForDisc.filter(s => !urgentInDisc.includes(s))];
                }

                for (const sid of sidsForDisc) {
                    if (courtIdx >= activeCourts) break;
                    const sp = seriesProgress[sid];
                    if (sp.nextRound > sp.maxRound) continue;

                    const currentRound = sp.nextRound;

                    // T8 phase gating
                    if (sp.seriesType === 'T8') {
                        const rm = seriesMatchMap[sid][currentRound];
                        if (rm?.[0]) {
                            const phase = rm[0].phase;
                            if (phase === 'demi' && !sp.poolsDone) continue;
                            if (phase === 'finale' && sp.nextRound <= 3) continue;
                        }
                    }

                    const roundMatches = seriesMatchMap[sid][currentRound];
                    if (!roundMatches) { sp.nextRound++; continue; }

                    const unplaced = roundMatches.filter(m => !m._placed);
                    if (unplaced.length === 0) {
                        if (sp.seriesType === 'T8' && currentRound === 2) sp.poolsDone = true;
                        roundDoneAt[`${sid}_${currentRound}`] = rotIdx;
                        sp.nextRound++;
                        if (wrapSeriesId === sid) { wrapSeriesId = null; wrapDiscipline = null; }
                        continue;
                    }

                    const isWrapContinuation = (wrapSeriesId === sid);
                    const available = activeCourts - courtIdx;

                    // Project where each unplaced match would land if we start placing from courtIdx
                    const projected = [];
                    let pRot = rotIdx, pCourt = courtIdx;
                    for (let i = 0; i < unplaced.length; i++) {
                        projected.push(pRot);
                        pCourt++;
                        if (pCourt >= activeCourts) { pRot++; pCourt = 0; }
                    }

                    // ── VERIFY ALL matches in this round against their projected rotation ────
                    let ok = true;
                    for (let i = 0; i < unplaced.length && ok; i++) {
                        const m = unplaced[i];
                        const pr = projected[i];

                        // Player rest: need at least 2 rotations between any player's matches
                        const players = [];
                        if (m.playerA) players.push(m.playerA.name);
                        if (m.playerB) players.push(m.playerB.name);
                        for (const p of players) {
                            if (playerLastRot[p] !== undefined && pr - playerLastRot[p] < 2) {
                                ok = false; break;
                            }
                            // No double-booking within the CURRENT rotation
                            if (pr === rotIdx) {
                                for (let c = 0; c < courtIdx; c++) {
                                    if (rotation.slots[c]?.players?.includes(p)) { ok = false; break; }
                                }
                            }
                            if (!ok) break;
                        }

                        // Series inter-round rest: skip when wrapping the same round
                        if (ok && !isWrapContinuation && seriesLastRot[sid] !== undefined) {
                            if (pr - seriesLastRot[sid] < 2) ok = false;
                        }

                        // Semi-final grouping: two demis must be within 1 rotation of each other
                        if (ok && m.phase === 'demi' && semiStartedAt[sid] !== undefined) {
                            if (pr - semiStartedAt[sid] > 1) ok = false;
                        }
                    }

                    if (!ok) continue; // Can't place any of this round now

                    // ── PLACE as many as fit in the current rotation ──────────────────────
                    const toPlace = unplaced.slice(0, Math.min(unplaced.length, available));

                    for (const m of toPlace) {
                        const players = [];
                        if (m.playerA) players.push(m.playerA.name);
                        if (m.playerB) players.push(m.playerB.name);

                        rotation.slots[courtIdx] = {
                            match: m,
                            players,
                            label: m.matchLabel,
                            seriesLabel: m.seriesLabel,
                            seriesId: m.seriesId,
                            phase: m.phase,
                            discipline: m.discipline,
                        };
                        m._placed = true;
                        m._rotation = rotIdx;

                        for (const p of players) playerLastRot[p] = rotIdx;
                        seriesLastRot[sid] = rotIdx;

                        if (m.phase === 'demi' && semiStartedAt[sid] === undefined) {
                            semiStartedAt[sid] = rotIdx;
                        }

                        courtIdx++;
                        anyPlaced = true;
                    }

                    // Did we finish the round?
                    if (toPlace.length === unplaced.length) {
                        if (sp.seriesType === 'T8' && currentRound === 2) sp.poolsDone = true;
                        roundDoneAt[`${sid}_${currentRound}`] = rotIdx;
                        sp.nextRound++;
                        if (wrapSeriesId === sid) { wrapSeriesId = null; wrapDiscipline = null; }
                    } else {
                        // Partial placement → this series wraps to next rotation
                        wrapSeriesId = sid;
                        wrapDiscipline = disc;
                    }
                }
            }

            if (!anyPlaced) {
                const allDone = Object.values(seriesProgress).every(sp => sp.nextRound > sp.maxRound);
                if (allDone) break;
                const lastFilled = rotations.findLastIndex(r => r.slots.some(s => s !== null));
                if (rotIdx - lastFilled > 5) break; // stuck, give up
            }

            rotations.push(rotation);
            rotIdx++;
        }

        // Clean internal flags
        for (const m of allMatches) { delete m._placed; delete m._rotation; }

        // Validate
        const validation = validateSchedule(rotations, courts, slotDuration, params);

        // Compute metrics — use activeCourts per rotation so court reduction is accounted for
        const totalSlots = rotations.reduce((acc, r) => acc + r.activeCourts, 0);
        const filledSlots = rotations.reduce((acc, r) => acc + r.slots.filter(Boolean).length, 0);
        const emptySlots = totalSlots - filledSlots;
        const occupancy = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
        const endTime = rotations.length > 0 ? rotations[rotations.length - 1].timeEnd : params.startTime;
        const totalExcluded = Object.values(categories).reduce((acc, cat) =>
            acc + (cat.partition?.excluded?.length ?? 0), 0);

        const result = {
            rotations,
            metrics: { occupancy, endTime, emptySlots, totalRotations: rotations.length, totalExcluded },
            violations: validation.violations,
        };

        // ── TRACK BEST BY OCCUPANCY (don't stop at first valid) ─────────────
        if (validation.valid) {
            if (!bestValidResult || result.metrics.occupancy > bestValidResult.metrics.occupancy) {
                bestValidResult = result;
                console.log(`Attempt ${attempt + 1}: valid ✅  occupancy=${result.metrics.occupancy}%`);
            }
            // Stop early only if we reach near-perfect occupancy
            if (bestValidResult.metrics.occupancy >= 98) break;
        } else {
            if (!bestResult ||
                validation.violations.length < bestResult.violations.length ||
                (validation.violations.length === bestResult.violations.length &&
                    result.metrics.occupancy > bestResult.metrics.occupancy)) {
                bestResult = result;
            }
            console.warn(`Attempt ${attempt + 1}: ${validation.violations.length} violations, occupancy=${result.metrics.occupancy}%`);
        }
    }

    // Return the valid result with highest occupancy, or best invalid as fallback
    return bestValidResult || bestResult;
}
