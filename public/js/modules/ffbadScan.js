/**
 * ffbadScan.js — FFBAD "les tops" scan integration
 *
 * Refines the 400-default points of Poussin players using their real cote
 * on myffbad.fr, matched by licence number. See imports.md for the full
 * design (règles métier, contraintes CORS, découverte de l'extraction JSON).
 */
import { getState, setState } from '../store.js';

const POUSSIN_PATTERN = /pou/i;

/**
 * True if the last scan happened on the current calendar day — FFBAD only
 * republishes its rankings once a day, no need to re-scan sooner.
 */
export function isScannedToday() {
    const scannedAt = getState().ffbadCotes?.scannedAt;
    if (!scannedAt) return false;
    return scannedAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

/**
 * Calls the local relay (see server.js) which fetches myffbad.fr
 * server-side — a direct browser fetch is blocked by CORS.
 */
export async function scanFFBad() {
    const response = await fetch('/api/ffbad-scan');
    if (!response.ok) {
        throw new Error(`Scan FFBAD échoué (HTTP ${response.status})`);
    }
    const { scannedAt, cotes } = await response.json();
    setState({ ffbadCotes: { scannedAt, cotes } });
    return cotes;
}

export function isPoussin(player) {
    return POUSSIN_PATTERN.test(player.category || '');
}

/**
 * Replaces the 400-default points of Poussin players with their real FFBAD
 * cote when their licence is found in the last scanned reference. Mutates
 * the given players in place. Returns the number of players refined.
 */
export function applyFFBadRefinement(players) {
    const cotes = getState().ffbadCotes?.cotes || {};
    let refined = 0;
    players.forEach(p => {
        if (p.points === 400 && isPoussin(p) && p.licence && cotes[p.licence] != null) {
            p.points = cotes[p.licence];
            p.isDefault = false;
            p.isFromFFBad = true;
            refined++;
        }
    });
    return refined;
}

/**
 * Scans myffbad.fr if needed (cache is stale) then applies the refinement.
 * Returns the number of players refined.
 */
export async function runFFBadScanAndRefine(players) {
    if (!isScannedToday()) {
        await scanFFBad();
    }
    return applyFFBadRefinement(players);
}
