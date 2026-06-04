/**
 * app.js — Application entry point
 *
 * Initializes state, binds events, and restores previous session.
 */

import { initStore, subscribe, getState } from './store.js';
import { initImport } from './modules/import.js';
import {
    initTabs, initTheme,
    renderImportResults, initSchedulerActions,
    restoreUI
} from './ui/render.js';

// ── Bootstrap ──
function init() {
    // 1. Initialize state (from localStorage or defaults)
    initStore();

    // 2. Setup UI bindings
    initTabs();
    initTheme();
    initImport();
    initSchedulerActions();

    // 3. Subscribe to state changes for auto-rendering import results
    // Only re-render when categories actually change (not on every setParams/setState)
    let _prevCategoryHash = '';
    subscribe((state) => {
        if (state.players && state.players.length > 0) {
            // Build a lightweight hash of the categories to detect real changes
            const catHash = JSON.stringify(Object.keys(state.categories || {}).sort()) +
                JSON.stringify(Object.values(state.categories || {}).map(c => (c.partition?.series?.length ?? 0) + '_' + (c.partition?.excluded?.length ?? 0) + '_' + (c.partition?.currentPartitionIndex ?? 0)));
            if (catHash !== _prevCategoryHash) {
                _prevCategoryHash = catHash;
                renderImportResults();
            }
        }
    });

    // 4. Restore previous session
    restoreUI();

    console.log('%c🏸 BADM-Optimizer initialized', 'color: #17b37b; font-weight: bold; font-size: 14px;');
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
