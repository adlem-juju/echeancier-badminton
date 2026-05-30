/**
 * optimizer.js — Scenario generation and optimization for dynamic categories
 */

import { findAlternativePartitions, buildSeries } from './partitioner.js';
import { buildSchedule } from './scheduler.js';

export function generateScenarios(categories, params) {
    // ── Scenario A: Standard ──
    const scheduleA = buildSchedule(categories, params);
    const scenarioA = {
        label: 'Standard',
        categories: JSON.parse(JSON.stringify(categories)),
        schedule: scheduleA,
        metrics: scheduleA.metrics,
    };

    // ── Scenario B: Alternative partition ──
    const scenarioB = generateAlternativeScenario(categories, params);

    // ── Scenario C: Optimized with exclusions (max 2 total) ──
    const scenarioC = generateExclusionScenario(categories, params);

    return { A: scenarioA, B: scenarioB, C: scenarioC };
}

function generateAlternativeScenario(categories, params) {
    const catKeys = Object.keys(categories);
    let bestCategories = null;
    let bestMetrics = null;
    let bestSchedule = null;

    // To prevent combinatorial explosion, we try replacing the partition of ONE category at a time
    // with its first alternative, leaving the others standard.
    let improvementFound = false;

    for (const key of catKeys) {
        const cat = categories[key];
        const alts = findAlternativePartitions(cat.players.length);
        if (alts.length <= 1) continue;

        // Try the second best alternative (first is usually what we have)
        const altPart = alts.find(a =>
            a.t8 !== cat.partition.partition.t8 ||
            a.pu6 !== cat.partition.partition.pu6 ||
            a.pu5 !== cat.partition.partition.pu5
        );

        if (!altPart) continue;

        // Deep copy categories
        const copyCats = JSON.parse(JSON.stringify(categories));
        copyCats[key].partition = buildSeriesFromPartition(copyCats[key].players, altPart);

        const schedule = buildSchedule(copyCats, params);

        if (!bestMetrics || schedule.metrics.occupancy > bestMetrics.occupancy) {
            bestMetrics = schedule.metrics;
            bestSchedule = schedule;
            bestCategories = copyCats;
            improvementFound = true;
        }
    }

    if (!improvementFound) {
        return {
            label: 'Partition alternative (aucune trouvée)',
            categories: JSON.parse(JSON.stringify(categories)),
            schedule: buildSchedule(categories, params),
            metrics: buildSchedule(categories, params).metrics,
        };
    }

    return {
        label: 'Partition alternative',
        categories: bestCategories,
        schedule: bestSchedule,
        metrics: bestMetrics,
    };
}

function generateExclusionScenario(categories, params) {
    const catKeys = Object.keys(categories);
    let bestCategories = null;
    let bestMetrics = null;
    let bestSchedule = null;
    let totalExclusions = 0;

    // Try excluding 1 or 2 players from ONE category whose standard partition has a remainder
    for (const key of catKeys) {
        const cat = categories[key];
        const numPlayers = cat.players.length;
        if (numPlayers <= 5) continue; // Cannot exclude if too small

        for (let ex = 1; ex <= 2; ex++) {
            const tryPlayers = cat.players.slice(0, numPlayers - ex);
            const tryPart = buildSeries(tryPlayers); // New optimal partition for reduced N

            // If even removing players results in exclusions, probably not a good path
            if (tryPart.excluded.length > 0) continue;

            const copyCats = JSON.parse(JSON.stringify(categories));
            copyCats[key].players = tryPlayers;
            copyCats[key].partition = tryPart;
            // Also store who was excluded for metrics
            copyCats[key].partition.excluded = cat.players.slice(-ex);

            const schedule = buildSchedule(copyCats, params);

            if (!bestMetrics || schedule.metrics.occupancy > bestMetrics.occupancy ||
                (schedule.metrics.occupancy === bestMetrics.occupancy && schedule.metrics.totalRotations < bestMetrics.totalRotations)) {
                bestMetrics = schedule.metrics;
                bestSchedule = schedule;
                bestCategories = copyCats;
                totalExclusions = ex;
            }
        }
    }

    if (!bestCategories) {
        return {
            label: 'Optimisé (aucune trouvée)',
            categories: JSON.parse(JSON.stringify(categories)),
            schedule: buildSchedule(categories, params),
            metrics: buildSchedule(categories, params).metrics,
        };
    }

    return {
        label: `Optimisé (-${totalExclusions} joueur${totalExclusions > 1 ? 's' : ''})`,
        categories: bestCategories,
        schedule: bestSchedule,
        metrics: bestMetrics,
    };
}

function buildSeriesFromPartition(players, partDesc) {
    const series = [];
    let idx = 0;
    let num = 1;

    for (let i = 0; i < partDesc.t8; i++) {
        series.push({
            type: 'T8', size: 8,
            label: `Série ${num} (T8)`,
            players: players.slice(idx, idx + 8),
            rankStart: idx + 1, rankEnd: idx + 8,
        });
        idx += 8; num++;
    }
    for (let i = 0; i < partDesc.pu6; i++) {
        series.push({
            type: 'PU6', size: 6,
            label: `Série ${num} (PU6)`,
            players: players.slice(idx, idx + 6),
            rankStart: idx + 1, rankEnd: idx + 6,
        });
        idx += 6; num++;
    }
    for (let i = 0; i < partDesc.pu5; i++) {
        series.push({
            type: 'PU5', size: 5,
            label: `Série ${num} (PU5)`,
            players: players.slice(idx, idx + 5),
            rankStart: idx + 1, rankEnd: idx + 5,
        });
        idx += 5; num++;
    }

    return {
        series,
        excluded: players.slice(idx), // if there are any left
        partition: partDesc,
    };
}
