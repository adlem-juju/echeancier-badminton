/**
 * app.js — Application entry point
 *
 * Initializes state, binds events, and restores previous session.
 */

import { initStore, subscribe, getState } from './store.js';
import { initImport } from './modules/import.js';
import {
    initTabs, initTheme, initReset,
    renderImportResults, initSchedulerActions,
    initOptimizerActions, restoreUI
} from './ui/render.js';

// ── Bootstrap ──
function init() {
    // 1. Initialize state (from localStorage or defaults)
    initStore();

    // 2. Setup UI bindings
    initTabs();
    initTheme();
    initReset();
    initImport();
    initSchedulerActions();
    initOptimizerActions();

    // 3. Subscribe to state changes for auto-rendering import results
    subscribe((state) => {
        if (state.players && state.players.length > 0) {
            renderImportResults();
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
