/**
 * render.js — DOM rendering for all UI sections
 */

import { getState, setState, setParams } from '../store.js';
import { processPlayers } from '../modules/partitioner.js';
import { buildSchedule } from '../modules/scheduler.js';
import { generateScenarios } from '../modules/optimizer.js';
import { exportToExcel } from '../modules/export.js';
import { showToast } from '../utils.js';

// ══════════════════════════════════════════
// Universal Colors Dictionary
// ══════════════════════════════════════════
const CATEGORY_COLORS = [
    { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400', mark: 'bg-blue-50 dark:bg-blue-950/20', dot: 'bg-blue-500', cell: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300' },
    { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-600 dark:text-pink-400', mark: 'bg-pink-50 dark:bg-pink-950/20', dot: 'bg-pink-500', cell: 'bg-pink-50 border-pink-200 text-pink-700 dark:bg-pink-950/30 dark:border-pink-800 dark:text-pink-300' },
    { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400', mark: 'bg-amber-50 dark:bg-amber-950/20', dot: 'bg-amber-500', cell: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300' },
    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-600 dark:text-emerald-400', mark: 'bg-emerald-50 dark:bg-emerald-950/20', dot: 'bg-emerald-500', cell: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' },
    { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400', mark: 'bg-purple-50 dark:bg-purple-950/20', dot: 'bg-purple-500', cell: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300' },
    { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-600 dark:text-rose-400', mark: 'bg-rose-50 dark:bg-rose-950/20', dot: 'bg-rose-500', cell: 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300' },
    { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-600 dark:text-indigo-400', mark: 'bg-indigo-50 dark:bg-indigo-950/20', dot: 'bg-indigo-500', cell: 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-300' },
    { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-600 dark:text-teal-400', mark: 'bg-teal-50 dark:bg-teal-950/20', dot: 'bg-teal-500', cell: 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-950/30 dark:border-teal-800 dark:text-teal-300' },
];

function getCategoryColor(catName) {
    const list = Object.keys(getState().categories || {}).sort();
    let idx = list.indexOf(catName);
    if (idx === -1) idx = 0;
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

// ══════════════════════════════════════════
// Tab Management
// ══════════════════════════════════════════

export function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
            setState({ activeTab: tabId });
        });
    });

    // Restore active tab
    const state = getState();
    if (state.activeTab) switchTab(state.activeTab);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));

    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    const section = document.getElementById(`tab-${tabId}`);
    if (btn) btn.classList.add('active');
    if (section) section.classList.remove('hidden');
}

// ══════════════════════════════════════════
// Theme Toggle
// ══════════════════════════════════════════

export function initTheme() {
    const btn = document.getElementById('btn-theme-toggle');
    const state = getState();

    // Apply saved theme
    if (state.theme === 'light') {
        document.documentElement.classList.remove('dark');
    } else {
        document.documentElement.classList.add('dark');
    }

    btn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        setState({ theme: isDark ? 'dark' : 'light' });
    });
}

// ══════════════════════════════════════════
// Import Tab Rendering
// ══════════════════════════════════════════

export function renderImportResults() {
    const state = getState();
    if (!state.categories || Object.keys(state.categories).length === 0) return;

    const container = document.getElementById('categories-container');
    container.innerHTML = ''; // clear

    let summaryHtml = '<div class="space-y-3">';

    // Loop through all dynamic categories
    Object.keys(state.categories).sort().forEach((catName, index) => {
        const cat = state.categories[catName];
        if (!cat.partition) return;

        // Visual colors variations
        const c = getCategoryColor(catName);

        // 1. Build the category card in preview section
        const cardHtml = `
          <div class="card">
            <h2 class="card-title">
              <span class="inline-flex items-center justify-center w-7 h-7 rounded-full ${c.bg} ${c.text} text-xs font-bold">
                ${catName.substring(0, 2).toUpperCase()}
              </span>
              ${catName}
              <span class="ml-auto text-sm font-normal text-gray-400">${cat.players.length} joueur(s)</span>
            </h2>
            <div>${renderPartitionDetails(cat.partition, catName)}</div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);

        // 2. Add to summary section
        const p = cat.partition.partition;
        const excludedCount = cat.partition.excluded ? cat.partition.excluded.length : 0;

        summaryHtml += `
          <div class="flex items-center justify-between p-3 rounded-lg ${c.mark}">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full ${c.dot} text-white text-[10px] font-bold uppercase truncate max-w-16">${catName}</span>
              <span class="text-sm font-medium">${cat.players.length} inscrits</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              ${p.t8 ? `<span class="series-tag t8">${p.t8}×T8</span>` : ''}
              ${p.pu6 ? `<span class="series-tag pu6">${p.pu6}×PU6</span>` : ''}
              ${p.pu5 ? `<span class="series-tag pu5">${p.pu5}×PU5</span>` : ''}
              ${excludedCount > 0 ? `<span class="text-red-500 font-semibold">−${excludedCount}</span>` : '<span class="text-brand-500">✓ 0 exclu</span>'}
            </div>
          </div>
        `;
    });

    summaryHtml += '</div>';

    // Update Summary card
    const summary = document.getElementById('partition-summary');
    const summaryContent = document.getElementById('partition-summary-content');
    summary.classList.remove('hidden');
    summaryContent.innerHTML = summaryHtml;

    // Also build the category selector for the scheduler
    let selectorHtml = '';
    const sortedCats = Object.keys(state.categories).sort();
    if (sortedCats.length > 0) {
        sortedCats.forEach(catName => {
            selectorHtml += `
              <label class="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-white dark:hover:bg-navy-800 rounded transition-colors group">
                <input type="checkbox" value="${catName}" class="category-checkbox w-4 h-4 text-brand-500 rounded border-gray-300 focus:ring-brand-500 bg-white" checked>
                <span class="text-sm font-medium group-hover:text-brand-500 transition-colors">${catName}</span>
              </label>
            `;
        });
    } else {
        selectorHtml = '<p class="text-xs text-gray-400 italic text-center py-2">Aucun tableau trouvé</p>';
    }

    const selectorContainer = document.getElementById('category-selector-container');
    if (selectorContainer) selectorContainer.innerHTML = selectorHtml;
}

function renderPartitionDetails(partition, discipline) {
    let html = '';

    partition.series.forEach(s => {
        const tagClass = s.type === 'T8' ? 't8' : s.type === 'PU6' ? 'pu6' : 'pu5';
        const desc = s.type === 'T8' ? '2 poules de 4 → Demis → Finale' :
            s.type === 'PU6' ? 'Poule unique — 5 tours (15 matchs)' :
                'Poule unique — 5 tours, 1 exempt (10 matchs)';

        html += `
      <div class="mb-4 p-3 rounded-xl bg-gray-50 dark:bg-navy-900/50 border border-gray-100 dark:border-navy-700">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="series-tag ${tagClass}">${s.type}</span>
            <span class="font-semibold text-sm">${s.label}</span>
          </div>
          <span class="text-xs text-gray-400">Rangs ${s.rankStart}–${s.rankEnd}</span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${desc}</p>
        <table class="player-table">
          <thead><tr>
            <th class="w-10">#</th>
            <th>Nom</th>
            <th class="text-right">Points</th>
          </tr></thead>
          <tbody>
            ${s.players.map(p => `
              <tr>
                <td class="text-gray-400 text-xs">${p.rank}</td>
                <td class="font-medium">${p.name}</td>
                <td class="text-right ${p.isDefault ? 'default-points' : ''}">
                  ${p.points}${p.isDefault ? ' <span class="text-[10px]">(estimé)</span>' : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    });

    if (partition.excluded.length > 0) {
        html += `
      <div class="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
          <span class="font-semibold text-sm text-red-600 dark:text-red-400">Joueurs exclus (${partition.excluded.length})</span>
        </div>
        ${partition.excluded.map(p => `
          <span class="inline-block px-2 py-1 mr-1 mb-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 player-excluded">${p.name} (${p.points}pts)</span>
        `).join('')}
      </div>
    `;
    }

    return html;
}

function renderPartitionSummary() {
    // Deprecated for the dynamic version inside renderImportResults directly
    return '';
}

// ══════════════════════════════════════════
// Schedule Grid Rendering
// ══════════════════════════════════════════

export function renderScheduleGrid(schedule, containerId, params) {
    const container = document.getElementById(containerId);
    if (!schedule || !schedule.rotations || schedule.rotations.length === 0) {
        container.innerHTML = '<p class="text-center py-10 text-gray-400">Aucun match à afficher.</p>';
        return;
    }

    let html = '<table class="schedule-table"><thead><tr>';
    html += '<th class="text-left">Rotation</th>';
    html += '<th class="text-left">Horaire</th>';
    for (let c = 0; c < params.courts; c++) {
        html += `<th>Terrain ${c + 1}</th>`;
    }
    html += '</tr></thead><tbody>';

    schedule.rotations.forEach((rot, idx) => {
        html += '<tr>';
        html += `<td class="font-bold text-xs text-brand-500">R${idx + 1}</td>`;
        html += `<td class="text-xs whitespace-nowrap text-gray-500">${rot.timeStart} - ${rot.timeEnd}</td>`;

        for (let c = 0; c < params.courts; c++) {
            const slot = rot.slots[c];
            if (slot) {
                const colorDef = getCategoryColor(slot.discipline);
                const discClass = `border ${colorDef.cell}`;
                const phaseClass = slot.phase === 'finale' ? 'final' : slot.phase === 'demi' ? 'final' : '';
                const phaseLabel = slot.phase === 'finale' ? '🏆 ' : slot.phase === 'demi' ? '⚔️ ' : '';

                const rText = slot.match && slot.match.round !== undefined ? (slot.match.round + 1) : '?';
                const phaseText = slot.phase === 'poule' ? `Tour ${rText}` :
                    slot.phase === 'demi' ? `1/2 Finale` : `Finale`;

                html += `<td>
                  <div class="match-cell ${phaseClass} ${discClass} flex flex-col justify-center items-center h-[72px]" title="${slot.label} — ${slot.seriesLabel}">
                    <div class="font-bold text-[11px] w-full text-center truncate px-1">${slot.discipline}</div>
                    <div class="text-[9px] w-full text-center truncate opacity-80 mb-1.5">${slot.seriesLabel}</div>
                    <div class="font-bold text-[10px] uppercase tracking-wide px-2 py-0.5 rounded shadow-sm bg-white/60 dark:bg-black/30 max-w-[90%] text-center truncate">${phaseLabel}${phaseText}</div>
                  </div>
                </td>`;
            } else {
                html += `<td><div class="match-cell empty flex items-center justify-center h-[72px]">—</div></td>`;
            }
        }
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════
// Scheduler Tab Actions
// ══════════════════════════════════════════

export function initSchedulerActions() {
    const btnGenerate = document.getElementById('btn-generate-schedule');
    const btnExport = document.getElementById('btn-export-xlsx');
    const btnToggleAll = document.getElementById('btn-toggle-all-cats');

    if (btnToggleAll) {
        btnToggleAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.category-checkbox');
            const anyUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
            checkboxes.forEach(cb => cb.checked = anyUnchecked);
            btnToggleAll.textContent = anyUnchecked ? 'Tout décocher' : 'Tout cocher';
        });
    }

    btnGenerate.addEventListener('click', () => {
        const state = getState();
        if (!state.categories || Object.keys(state.categories).length === 0) {
            showToast('Veuillez d\'abord importer une liste de joueurs.', 'error');
            return;
        }

        const checkboxes = document.querySelectorAll('.category-checkbox');
        const selectedCatNames = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

        if (selectedCatNames.length === 0) {
            showToast('Veuillez sélectionner au moins un tableau à planifier.', 'error');
            return;
        }

        const selectedCategories = {};
        selectedCatNames.forEach(name => {
            if (state.categories[name]) {
                selectedCategories[name] = state.categories[name];
            }
        });

        // Read params from inputs
        const params = {
            startTime: document.getElementById('param-start-time').value,
            courts: parseInt(document.getElementById('param-courts').value) || 8,
            matchDuration: parseInt(document.getElementById('param-match-duration').value) || 27,
            warmup: parseInt(document.getElementById('param-warmup').value) || 3,
            rest: parseInt(document.getElementById('param-rest').value) || 20,
        };
        setParams(params);

        // Generate schedule
        const schedule = buildSchedule(selectedCategories, params);
        setState({
            schedules: { ...state.schedules, A: { schedule, categories: selectedCategories } },
            appliedScenario: 'A',
        });

        // Render grid
        document.getElementById('schedule-placeholder').classList.add('hidden');
        document.getElementById('schedule-grid').classList.remove('hidden');
        renderScheduleGrid(schedule, 'schedule-grid', params);

        // Show stats
        document.getElementById('schedule-stats').classList.remove('hidden');
        document.getElementById('stat-occupancy').textContent = `${schedule.metrics.occupancy}%`;
        document.getElementById('stat-end-time').textContent = schedule.metrics.endTime;

        // Show export button
        btnExport.classList.remove('hidden');

        showToast(`Échéancier généré : ${schedule.rotations.length} rotations, ${schedule.metrics.occupancy}% d'occupation`, 'success');
    });

    btnExport.addEventListener('click', () => {
        const state = getState();
        const scenarioKey = state.appliedScenario || 'A';
        const scenarioData = state.schedules[scenarioKey];
        if (!scenarioData) {
            showToast('Aucun échéancier à exporter.', 'error');
            return;
        }
        exportToExcel(
            scenarioData.schedule,
            scenarioData.categories,
            state.players,
            state.params
        );
        showToast('Fichier Excel exporté !', 'success');
    });
}

// ══════════════════════════════════════════
// Optimizer Tab
// ══════════════════════════════════════════

export function initOptimizerActions() {
    const scenarioButtons = document.querySelectorAll('.scenario-card');
    const btnApply = document.getElementById('btn-apply-scenario');

    scenarioButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const scenarioKey = btn.id.replace('scenario-', '').toUpperCase();
            selectScenario(scenarioKey);
        });
    });

    btnApply.addEventListener('click', () => {
        const state = getState();
        const key = state.activeScenario;
        if (!state.schedules[key]) {
            showToast('Aucun scénario à appliquer.', 'error');
            return;
        }
        setState({ appliedScenario: key });

        // Update the main scheduler grid too
        const scenarioData = state.schedules[key];
        document.getElementById('schedule-placeholder').classList.add('hidden');
        document.getElementById('schedule-grid').classList.remove('hidden');
        renderScheduleGrid(scenarioData.schedule, 'schedule-grid', state.params);

        document.getElementById('schedule-stats').classList.remove('hidden');
        document.getElementById('stat-occupancy').textContent = `${scenarioData.schedule.metrics.occupancy}%`;
        document.getElementById('stat-end-time').textContent = scenarioData.schedule.metrics.endTime;
        document.getElementById('btn-export-xlsx').classList.remove('hidden');

        showToast(`Scénario ${key} appliqué comme échéancier actif.`, 'success');
    });
}

function selectScenario(key) {
    const state = getState();

    // Generate scenarios if not yet done
    if (!state.schedules.B || !state.schedules.C) {
        if (!state.categories || Object.keys(state.categories).length === 0) {
            showToast('Veuillez d\'abord importer des joueurs et générer un échéancier.', 'error');
            return;
        }

        const targetCategories = state.schedules.A && state.schedules.A.categories ? state.schedules.A.categories : state.categories;
        const scenarios = generateScenarios(targetCategories, state.params);

        setState({
            schedules: {
                A: scenarios.A ? { schedule: scenarios.A.schedule, categories: scenarios.A.categories } : { schedule: state.schedules.A.schedule, categories: state.schedules.A.categories },
                B: { schedule: scenarios.B.schedule, categories: scenarios.B.categories },
                C: { schedule: scenarios.C.schedule, categories: scenarios.C.categories },
            },
        });
    }

    setState({ activeScenario: key });

    // Update UI
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`scenario-${key.toLowerCase()}`).classList.add('active');

    const updatedState = getState();
    const scenarioData = updatedState.schedules[key];
    if (scenarioData && scenarioData.schedule) {
        const metrics = scenarioData.schedule.metrics;

        document.getElementById('metric-occupancy').textContent = `${metrics.occupancy}%`;
        document.getElementById('metric-end-time').textContent = metrics.endTime;
        document.getElementById('metric-empty-courts').textContent = metrics.emptySlots;
        document.getElementById('metric-excluded').textContent = metrics.totalExcluded;

        // Render optimizer grid
        document.getElementById('optimizer-placeholder').classList.add('hidden');
        document.getElementById('optimizer-grid').classList.remove('hidden');
        renderScheduleGrid(scenarioData.schedule, 'optimizer-grid', updatedState.params);
    }
}

// ══════════════════════════════════════════
// Reset
// ══════════════════════════════════════════

export function initReset() {
    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm('Réinitialiser toutes les données du tournoi ? Cette action est irréversible.')) {
            localStorage.removeItem('badm_optimizer_state');
            location.reload();
        }
    });
}

// ══════════════════════════════════════════
// Restore state on page load
// ══════════════════════════════════════════

export function restoreUI() {
    const state = getState();

    // Restore params
    if (state.params) {
        const p = state.params;
        const el = (id) => document.getElementById(id);
        if (p.startTime) el('param-start-time').value = p.startTime;
        if (p.courts) el('param-courts').value = p.courts;
        if (p.matchDuration) el('param-match-duration').value = p.matchDuration;
        if (p.warmup !== undefined) el('param-warmup').value = p.warmup;
        if (p.rest) el('param-rest').value = p.rest;
    }

    // Restore import results
    if (state.players && state.players.length > 0) {
        document.getElementById('file-info').classList.remove('hidden');
        document.getElementById('file-name').textContent = 'Données restaurées';
        document.getElementById('file-stats').textContent =
            `${state.players.length} joueur(s) — ${state.players.filter(p => p.sex === 'M').length} SH, ${state.players.filter(p => p.sex === 'F').length} SD`;

        renderImportResults();
    }

    // Restore schedule
    if (state.appliedScenario && state.schedules[state.appliedScenario]) {
        const scenarioData = state.schedules[state.appliedScenario];
        if (scenarioData.schedule) {
            document.getElementById('schedule-placeholder').classList.add('hidden');
            document.getElementById('schedule-grid').classList.remove('hidden');
            renderScheduleGrid(scenarioData.schedule, 'schedule-grid', state.params);
            document.getElementById('schedule-stats').classList.remove('hidden');
            document.getElementById('stat-occupancy').textContent = `${scenarioData.schedule.metrics.occupancy}%`;
            document.getElementById('stat-end-time').textContent = scenarioData.schedule.metrics.endTime;
            document.getElementById('btn-export-xlsx').classList.remove('hidden');
        }
    }
}
