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
// Each entry:
//   bg/text/mark/dot: used for cards and badges (Tailwind classes)
//   solid: solid background hex used for the schedule GRID cells
//   solidText: text color on top of solid background
const CATEGORY_COLORS = [
    { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', mark: 'bg-blue-50 dark:bg-blue-950/20', dot: 'bg-blue-500', solid: '#BFDBFE', solidDark: '#1e3a5f', solidText: '#1e40af' },
    { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', mark: 'bg-pink-50 dark:bg-pink-950/20', dot: 'bg-pink-500', solid: '#FBCFE8', solidDark: '#5b1a39', solidText: '#9d174d' },
    { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', mark: 'bg-amber-50 dark:bg-amber-950/20', dot: 'bg-amber-500', solid: '#FDE68A', solidDark: '#5c3c00', solidText: '#92400e' },
    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', mark: 'bg-emerald-50 dark:bg-emerald-950/20', dot: 'bg-emerald-500', solid: '#A7F3D0', solidDark: '#064e3b', solidText: '#065f46' },
    { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', mark: 'bg-purple-50 dark:bg-purple-950/20', dot: 'bg-purple-500', solid: '#DDD6FE', solidDark: '#3b1e6e', solidText: '#5b21b6' },
    { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', mark: 'bg-rose-50 dark:bg-rose-950/20', dot: 'bg-rose-500', solid: '#FECDD3', solidDark: '#5c1a27', solidText: '#9f1239' },
    { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', mark: 'bg-indigo-50 dark:bg-indigo-950/20', dot: 'bg-indigo-500', solid: '#C7D2FE', solidDark: '#1e274d', solidText: '#3730a3' },
    { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', mark: 'bg-teal-50 dark:bg-teal-950/20', dot: 'bg-teal-500', solid: '#99F6E4', solidDark: '#0d3d33', solidText: '#0f766e' },
    { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', mark: 'bg-orange-50 dark:bg-orange-950/20', dot: 'bg-orange-500', solid: '#FED7AA', solidDark: '#5c2900', solidText: '#c2410c' },
    { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', mark: 'bg-cyan-50 dark:bg-cyan-950/20', dot: 'bg-cyan-500', solid: '#A5F3FC', solidDark: '#0c3d47', solidText: '#0e7490' },
];

// Detect dark mode
function isDark() { return document.documentElement.classList.contains('dark'); }

function getCategoryColor(catName) {
    const list = Object.keys(getState().categories || {}).sort();
    let idx = list.indexOf(catName);
    if (idx === -1) idx = 0;
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

export function getSeriesHexColor(catName, seriesId) {
    const state = getState();
    // seriesId can come in two formats:
    // - color picker key format: 'CatName_0' (0-based index)
    // - scheduler slot format: 'CatName_S1' (1-based label)
    // Normalize both to 'CatName_0' form
    let lookupKey = seriesId;
    if (seriesId) {
        const matchS = seriesId.match(/^(.+)_S(\d+)$/);
        if (matchS) {
            lookupKey = `${matchS[1]}_${parseInt(matchS[2]) - 1}`;
        }
    }
    if (state.customSeriesColors && state.customSeriesColors[lookupKey]) {
        return state.customSeriesColors[lookupKey];
    }
    return getCategoryColor(catName).solid;
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
    if (!state.categories || Object.keys(state.categories).length === 0) {
        document.getElementById('import-placeholder').classList.remove('hidden');
        document.getElementById('import-dashboard').classList.add('hidden');
        return;
    }

    document.getElementById('import-placeholder').classList.add('hidden');
    document.getElementById('import-dashboard').classList.remove('hidden');

    const sortedCats = Object.keys(state.categories).sort();
    if (!state.activeCategoryTab || !state.categories[state.activeCategoryTab]) {
        // Use setState to properly store it and get it in further reads
        const firstCat = sortedCats[0];
        state.activeCategoryTab = firstCat; // also mutate for immediate use below
        try { localStorage.setItem('badm_optimizer_state', JSON.stringify({ ...state, activeCategoryTab: firstCat })); } catch (e) { }
    }

    renderSidebarStatus(state, sortedCats);
    renderTopMetrics(state, sortedCats);
    renderOverviewTable(state, sortedCats);
    renderCategoryTabs(state, sortedCats);
    renderActiveCategoryDetail(state);

    updateSchedulerChecklist(state, sortedCats);
    renderSchedulerFilters(state, sortedCats);
    attachCategoryListeners();
}

function renderSidebarStatus(state, sortedCats) {
    const container = document.getElementById('sidebar-status-container');
    let html = `
      <table class="w-full text-left text-xs mb-4">
        <thead class="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-navy-800">
          <tr>
            <th class="py-2 font-medium">Tableau</th>
            <th class="py-2 font-medium text-center">Joueurs</th>
            <th class="py-2 font-medium text-center">Exclus</th>
            <th class="py-2 font-medium text-center">Forcer</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-navy-800/50">
    `;

    sortedCats.forEach(catName => {
        const cat = state.categories[catName];
        if (!cat.partition) return;

        const c = getCategoryColor(catName);
        const p = cat.partition;
        const exclCount = p.excluded ? p.excluded.length : 0;
        const exclColor = exclCount > 0 ? 'text-red-500 font-bold' : 'text-gray-400';

        // Configuration State
        const isForced = cat.config && cat.config.mode === 'forced';
        const forcedVal = isForced ? cat.config.forcedExcludedCount : '';

        html += `
          <tr>
            <td class="py-2 flex items-center gap-1.5 whitespace-nowrap">
               <span class="w-2 h-2 rounded-full ${c.dot}"></span>
               ${catName}
            </td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-300">${cat.players.length}</td>
            <td class="py-2 text-center ${exclColor}">${exclCount}</td>
            <td class="py-2 text-center">
               <input type="number" min="0" max="${cat.players.length}" value="${forcedVal}"
                 class="sidebar-force-input w-10 px-1 border border-gray-200 dark:border-navy-700 rounded text-center text-xs dark:bg-navy-900 focus:ring-1 focus:ring-brand-500 appearance-none m-0" 
                 data-cat="${catName}" placeholder="-">
            </td>
          </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderTopMetrics(state, sortedCats) {
    const container = document.getElementById('kpi-container');
    let totalInscrits = 0;
    let totalMatchs = 0;
    let totalSeries = 0;
    let totalExclus = 0;

    sortedCats.forEach(catName => {
        const cat = state.categories[catName];
        if (!cat.partition) return;

        totalInscrits += cat.players.length;
        totalExclus += cat.partition.excluded ? cat.partition.excluded.length : 0;

        const p = cat.partition.partition;
        totalSeries += (p.t8 || 0) + (p.pu7 || 0) + (p.pu6 || 0) + (p.pu5 || 0) + (p.pu4 || 0) + (p.pu3 || 0);

        cat.partition.series.forEach(s => {
            // Approximation matchs by type
            if (s.type === 'T8') totalMatchs += 15; // 12 poule + 2 demis + finale (approx)
            if (s.type === 'PU6') totalMatchs += 15;
            if (s.type === 'PU5') totalMatchs += 10;
            if (s.type === 'PU4') totalMatchs += 6;
            if (s.type === 'PU7') totalMatchs += 21;
            if (s.type === 'PU3') totalMatchs += 3;
        });
    });

    const exclStr = totalExclus > 0 ? `<span class="text-red-500">${totalExclus}</span>` : `<span class="text-gray-900 dark:text-gray-100">0</span>`;

    container.innerHTML = `
      <div class="px-2 border-r border-gray-100 dark:border-navy-800">
         <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Joueurs inscrits</p>
         <div class="text-2xl font-bold dark:text-white">${totalInscrits}</div>
         <p class="text-[10px] text-gray-500 mt-1">${sortedCats.length} tableaux</p>
      </div>
      <div class="px-2 border-r md:border-gray-100 dark:md:border-navy-800">
         <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Matchs planifiés</p>
         <div class="text-2xl font-bold dark:text-white">${totalMatchs}</div>
         <p class="text-[10px] text-gray-500 mt-1">environ</p>
      </div>
      <div class="px-2 border-r border-gray-100 dark:border-navy-800">
         <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Séries importées</p>
         <div class="text-2xl font-bold text-brand-600 dark:text-brand-400">${totalSeries}</div>
         <p class="text-[10px] text-gray-500 mt-1">complètes</p>
      </div>
      <div class="px-2">
         <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Joueurs exclus</p>
         <div class="text-2xl font-bold flex items-center">${exclStr} <span class="text-xs text-gray-400 font-normal ml-2 mt-1">/ ${totalInscrits}</span></div>
      </div>
    `;
}

function renderOverviewTable(state, sortedCats) {
    const tbody = document.getElementById('overview-table-body');
    const badge = document.getElementById('tableaux-count-badge');
    if (badge) badge.textContent = `${sortedCats.length} tableaux`;

    let html = '';
    sortedCats.forEach(catName => {
        const cat = state.categories[catName];
        if (!cat.partition) return;

        const p = cat.partition.partition;
        const totalSeriesCat = (p.t8 || 0) + (p.pu7 || 0) + (p.pu6 || 0) + (p.pu5 || 0) + (p.pu4 || 0) + (p.pu3 || 0);

        let matchEstimate = 0;
        cat.partition.series.forEach(s => {
            if (s.type === 'T8') matchEstimate += 15;
            if (s.type === 'PU6') matchEstimate += 15;
            if (s.type === 'PU5') matchEstimate += 10;
            if (s.type === 'PU4') matchEstimate += 6;
            if (s.type === 'PU7') matchEstimate += 21;
            if (s.type === 'PU3') matchEstimate += 3;
        });

        const exclCount = cat.partition.excluded ? cat.partition.excluded.length : 0;
        const rowBg = exclCount > 0 ? 'bg-red-50/40 dark:bg-red-900/10' : '';
        const exclText = exclCount > 0 ? `<span class="text-red-500 font-medium">${exclCount}</span>` : `<span class="text-gray-400">0</span>`;

        html += `
          <tr class="${rowBg}">
             <td class="px-4 py-3 font-medium whitespace-nowrap">${catName}</td>
             <td class="px-4 py-3 text-center">${cat.players.length}</td>
             <td class="px-4 py-3 text-center">${totalSeriesCat}</td>
             <td class="px-4 py-3 text-center">${matchEstimate}</td>
             <td class="px-4 py-3 text-center">${exclText}</td>
          </tr>
        `;
    });

    tbody.innerHTML = html;
}

function renderCategoryTabs(state, sortedCats) {
    const container = document.getElementById('category-tabs-container');
    let html = '';

    sortedCats.forEach(catName => {
        const isActive = state.activeCategoryTab === catName;
        const c = getCategoryColor(catName);

        const baseClass = 'px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all whitespace-nowrap border';
        const cls = isActive
            ? `${c.bg} ${c.text} border-transparent ring-2 ring-offset-1 ring-offset-white dark:ring-offset-navy-900`
            : 'bg-white dark:bg-navy-800 border-gray-200 dark:border-navy-600 text-gray-500 hover:border-gray-300 dark:hover:border-navy-500 hover:text-gray-700 dark:hover:text-gray-300';

        html += `<button class="category-tab-btn ${baseClass} ${cls}" data-cat="${catName}">${catName}</button>`;
    });

    container.innerHTML = html;
}

function renderActiveCategoryDetail(state) {
    const container = document.getElementById('series-detail-container');
    const catName = state.activeCategoryTab;
    if (!catName || !state.categories[catName]) {
        container.innerHTML = '';
        return;
    }

    const cat = state.categories[catName];
    if (!cat || !cat.partition || !cat.partition.series) {
        container.innerHTML = '<p class="text-sm text-gray-400 italic col-span-3 text-center py-8">Aucune série disponible pour ce tableau.</p>';
        return;
    }

    let html = '';

    // Series Cards
    cat.partition.series.forEach((s, i) => {
        const typeLabel = s.type === 'T8' ? 'T8 (2 poules + finales)' : `Poule unique — ${s.players.length} joueurs`;
        html += `
          <div class="card p-0 overflow-hidden flex flex-col border border-gray-100 dark:border-navy-700 shadow-sm hover:shadow-md transition-shadow h-full">
            <div class="px-4 py-3 bg-gray-50/50 dark:bg-navy-900/50 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
               <div>
                 <span class="font-bold text-sm">Série ${i + 1}</span>
                 <span class="text-xs text-gray-400 ml-2">${typeLabel}</span>
               </div>
            </div>
            <div class="p-0 overflow-x-auto flex-1">
              <table class="w-full text-xs text-left">
                <thead class="text-[10px] uppercase text-gray-400 border-b border-gray-50 dark:border-navy-800">
                  <tr>
                    <th class="px-4 py-2 font-medium w-8">#</th>
                    <th class="px-2 py-2 font-medium">Nom</th>
                    <th class="px-4 py-2 font-medium text-right w-16">Points</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-navy-800">
                  ${s.players.map((p, pIdx) => `
                    <tr>
                      <td class="px-4 py-2 text-gray-400">${pIdx + 1}</td>
                      <td class="px-2 py-2 font-medium whitespace-nowrap">
                         ${p.name}
                         <span class="block text-[9px] text-gray-400 font-normal mt-0.5">${p.club || ''}</span>
                      </td>
                      <td class="px-4 py-2 text-right ${p.isDefault ? 'text-amber-500 italic' : ''}">${p.points}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
    });

    const btnClass = cat.partition.validPartitionsCount > 1
        ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/50 cursor-pointer text-brand-600 dark:text-brand-400 btn-cycle-partition'
        : 'border-gray-200 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/40 cursor-not-allowed opacity-60 text-gray-400';

    html += `
      <div class="card p-4 border border-dashed flex flex-col items-center justify-center h-full min-h-[200px] transition-colors ${btnClass}" data-cat="${catName}">
         <svg class="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
           <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
         </svg>
         <span class="text-xs font-semibold uppercase tracking-wider text-center">Autre combinaison</span>
         <span class="text-[10px] mt-1 opacity-70">
           ${(cat.partition.currentPartitionIndex || 0) + 1} / ${cat.partition.validPartitionsCount || 1} disponibles
         </span>
      </div>
    `;

    container.innerHTML = html;

    // Attach event delegation if not already attached
    if (!container.dataset.listenerAttached) {
        container.dataset.listenerAttached = 'true';
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-cycle-partition');
            if (btn) {
                const targetCat = btn.getAttribute('data-cat');
                const currentState = getState();
                const curCat = currentState.categories[targetCat];
                if (curCat && curCat.partition && curCat.partition.validPartitionsCount > 1) {
                    const nextIndex = (curCat.partition.currentPartitionIndex + 1) % curCat.partition.validPartitionsCount;
                    // updateCategoryConfig is in the same file! We just need to trigger the update
                    updateCategoryConfig(targetCat, { partitionIndex: nextIndex });
                }
            }
        });
    }
}

function updateSchedulerChecklist(state, sortedCats) {
    // Capture current checked state from DOM to preserve it (prevent reset on color change)
    const currentChecked = new Set();
    const currentIndeterminate = new Set();
    document.querySelectorAll('.series-checkbox:checked').forEach(cb => currentChecked.add(cb.value));
    document.querySelectorAll('.parent-cat-cb').forEach(cb => {
        if (cb.checked) currentChecked.add('cat_' + cb.value);
        if (cb.indeterminate) currentIndeterminate.add('cat_' + cb.value);
    });

    let selectorHtml = '';
    if (sortedCats.length > 0) {
        sortedCats.forEach(catName => {
            const cat = state.categories[catName];
            if (!cat.partition) return;

            let catMatchTotal = 0;
            const seriesHtmlList = cat.partition.series.map((s, idx) => {
                let sMatches = 0;
                if (s.type === 'T8') sMatches = 15;
                else if (s.type === 'PU6') sMatches = 15;
                else if (s.type === 'PU5') sMatches = 10;
                else if (s.type === 'PU4') sMatches = 6;
                else if (s.type === 'PU7') sMatches = 21;
                else if (s.type === 'PU3') sMatches = 3;
                catMatchTotal += sMatches;

                const seriesId = `${catName}_${idx}`;
                const hexColor = getSeriesHexColor(catName, seriesId);
                const isChecked = currentChecked.has(seriesId) || currentChecked.size === 0; // Default to checked if nothing is in DOM

                return `
                  <div class="flex items-center pl-6 pr-2 py-1 hover:bg-gray-50 dark:hover:bg-navy-800/50 rounded transition-colors group">
                    <label class="flex items-center gap-2 cursor-pointer w-full">
                       <input type="checkbox" ${isChecked ? 'checked' : ''} data-cat="${catName}" data-series="${idx}" value="${seriesId}" class="series-checkbox w-3 h-3 text-brand-500 rounded border-gray-300 bg-white">
                       <span class="text-[11px] text-gray-600 dark:text-gray-300">Série ${idx + 1} <span class="font-normal opacity-60">(${s.type})</span></span>
                       <span class="ml-auto text-[10px] text-gray-400 font-mono">${sMatches} m.</span>
                    </label>
                    <input type="color" data-series="${seriesId}" value="${hexColor}" class="series-color-picker w-5 h-5 rounded cursor-pointer ml-3 flex-shrink-0 border-none p-0 bg-transparent shadow-sm hover:scale-110 transition-transform" style="-webkit-appearance: none; appearance: none; padding: 0;">
                  </div>
                `;
            });

            const parentChecked = currentChecked.size === 0 ? 'checked' : (currentChecked.has('cat_' + catName) ? 'checked' : '');

            selectorHtml += `
              <div class="mb-1">
                <label class="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-gray-100 dark:hover:bg-navy-800 rounded transition-colors group w-full">
                  <svg class="w-3 h-3 text-gray-400 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                  <input type="checkbox" value="${catName}" class="category-checkbox parent-cat-cb w-4 h-4 text-brand-500 flex-shrink-0 rounded border-gray-300 focus:ring-brand-500 bg-white" ${parentChecked} />
                  <span class="text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-brand-500 transition-colors whitespace-nowrap">${catName}</span>
                  <div class="ml-auto flex items-center gap-2">
                     <span class="text-xs font-mono text-gray-500">${catMatchTotal} m.</span>
                  </div>
                </label>
                <div class="space-y-0.5 mt-0.5 border-l border-gray-200 dark:border-navy-700 ml-2.5">
                   ${seriesHtmlList.join('')}
                </div>
              </div>
            `;
        });
    } else {
        selectorHtml = '<p class="text-xs text-gray-400 italic text-center py-2">Aucun tableau trouvé</p>';
    }

    const selectorContainer = document.getElementById('category-selector-container');
    if (selectorContainer) {
        selectorContainer.innerHTML = selectorHtml;

        // Restore indeterminate states manually
        document.querySelectorAll('.parent-cat-cb').forEach(cb => {
            if (currentIndeterminate.has('cat_' + cb.value)) cb.indeterminate = true;
        });

        if (!selectorContainer.dataset.listenerAttached) {
            selectorContainer.dataset.listenerAttached = 'true';
            selectorContainer.addEventListener('change', (e) => {
                // Hierarchical logic
                if (e.target.classList.contains('parent-cat-cb')) {
                    const catName = e.target.value;
                    const isChecked = e.target.checked;
                    selectorContainer.querySelectorAll(`.series-checkbox[data-cat="${catName}"]`).forEach(cb => cb.checked = isChecked);
                } else if (e.target.classList.contains('series-checkbox')) {
                    const catName = e.target.getAttribute('data-cat');
                    const parentCb = selectorContainer.querySelector(`.parent-cat-cb[value="${catName}"]`);
                    if (parentCb) {
                        const siblings = Array.from(selectorContainer.querySelectorAll(`.series-checkbox[data-cat="${catName}"]`));
                        const anyChecked = siblings.some(cb => cb.checked);
                        const allChecked = siblings.every(cb => cb.checked);
                        parentCb.checked = anyChecked;
                        parentCb.indeterminate = anyChecked && !allChecked;
                    }
                }
                // Color Picker logic
                else if (e.target.classList.contains('series-color-picker')) {
                    const seriesId = e.target.getAttribute('data-series');
                    const newHex = e.target.value;

                    const state = getState();
                    if (!state.customSeriesColors) state.customSeriesColors = {};
                    state.customSeriesColors[seriesId] = newHex;
                    setState({ customSeriesColors: state.customSeriesColors });

                    // Re-render schedule if active
                    if (state.appliedScenario && state.schedules[state.appliedScenario]) {
                        renderScheduleGrid(state.schedules[state.appliedScenario].schedule, 'schedule-grid', state.params);
                    }
                }
            });
        }
    }
}

function renderSchedulerFilters(state, sortedCats) {
    const container = document.getElementById('schedule-tabs-container');
    if (!container) return;

    let html = `<button class="sched-filter-btn px-3 py-1 rounded-full text-[10px] font-semibold bg-brand-50 dark:bg-brand-900/40 text-brand-600 border border-brand-200 dark:border-brand-800 transition-colors" data-filter="all">Tous</button>`;

    sortedCats.forEach(catName => {
        html += `<button class="sched-filter-btn px-3 py-1 rounded-full text-[10px] font-semibold bg-white dark:bg-navy-800 text-gray-500 border border-gray-200 dark:border-navy-600 hover:border-gray-300 dark:hover:border-navy-500 transition-colors" data-filter="${catName}">${catName}</button>`;
    });

    container.innerHTML = html;

    // Attach filter listeners
    document.querySelectorAll('.sched-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Visual update of pills
            document.querySelectorAll('.sched-filter-btn').forEach(b => {
                b.classList.remove('bg-brand-50', 'dark:bg-brand-900/40', 'text-brand-600', 'border-brand-200', 'dark:border-brand-800');
                b.classList.add('bg-white', 'dark:bg-navy-800', 'text-gray-500', 'border-gray-200', 'dark:border-navy-600');
            });
            const clicked = e.target;
            clicked.classList.remove('bg-white', 'dark:bg-navy-800', 'text-gray-500', 'border-gray-200', 'dark:border-navy-600');
            clicked.classList.add('bg-brand-50', 'dark:bg-brand-900/40', 'text-brand-600', 'border-brand-200', 'dark:border-brand-800');

            // Filter grid logic
            const filterTarget = clicked.getAttribute('data-filter');
            const matchBlocks = document.querySelectorAll('.match-block, .bg-purple-200, .bg-teal-200, .bg-orange-200, .bg-blue-200, .bg-pink-200, .bg-indigo-200, .bg-green-200'); // targeting the colored cells in the grid. Better to add a class in the scheduler generator.
            // Wait, the match blocks in generateSchedule don't have a `.match-block` class. They have an ID or inline style or color class.
            // Let's just create `.match-cell` dynamically if it doesn't exist, wait, the user's scheduler HTML is generated in scheduler.js.
            // Let's just use CSS rules for filtering
            const styleId = 'sched-filter-style';
            let styleTag = document.getElementById(styleId);
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = styleId;
                document.head.appendChild(styleTag);
            }
            if (filterTarget === 'all') {
                styleTag.innerHTML = '';
            } else {
                styleTag.innerHTML = `
                    #schedule-grid td:not(.cat-header) { opacity: 0.15; transition: opacity 0.2s; }
                    #schedule-grid td[data-cat="${filterTarget}"] { opacity: 1; }
                `;
            }
        });
    });
}

/**
 * Attaches event listeners to the interactive elements
 */
function attachCategoryListeners() {
    // Left Sidebar "Forcer" inputs
    document.querySelectorAll('.sidebar-force-input').forEach(input => {
        // use 'blur' or 'input' ? 'change' is good for spinboxes
        input.addEventListener('change', (e) => {
            const catName = e.target.getAttribute('data-cat');
            if (e.target.value === '') {
                // Return to auto mode
                updateCategoryConfig(catName, { mode: 'auto', forcedExcludedCount: 0 });
            } else {
                let forcedExt = parseInt(e.target.value) || 0;
                if (forcedExt < 0) forcedExt = 0;
                e.target.value = forcedExt;
                updateCategoryConfig(catName, { mode: 'forced', forcedExcludedCount: forcedExt });
            }
        });
    });

    // Pill Tab Buttons (Event Delegation)
    const tabsContainer = document.getElementById('category-tabs-container');
    if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
        tabsContainer.dataset.listenerAttached = 'true';
        tabsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-tab-btn');
            if (btn) {
                const catName = btn.getAttribute('data-cat');
                setState({ activeCategoryTab: catName });
                // re-render just tabs and detail area
                const state = getState();
                const sortedCats = Object.keys(state.categories).sort();
                renderCategoryTabs(state, sortedCats);
                renderActiveCategoryDetail(state);
            }
        });
    }

    // Global Department Input 
    const deptInput = document.getElementById('global-dept-input');
    if (deptInput && !deptInput.dataset.listenerAttached) {
        deptInput.dataset.listenerAttached = 'true';
        deptInput.addEventListener('change', (e) => {
            const targetDept = e.target.value.trim();
            const state = getState();
            Object.keys(state.categories).forEach(catName => {
                updateCategoryConfig(catName, { targetDept }, false); // Don't re-render immediately
            });
            renderImportResults(); // Re-render all once at the end
        });
    }
}

/**
 * Merges new config, processes players, updates state, and re-renders
 */
function updateCategoryConfig(catName, configChanges, triggerRender = true) {
    const state = getState();
    const cat = state.categories[catName];
    if (!cat) return;

    // Load defaults if none exists
    const globalDept = document.getElementById('global-dept-input')?.value.trim() || '44';
    if (!cat.config) {
        cat.config = { targetDept: globalDept, mode: 'auto', forcedExcludedCount: 0 };
    }

    // If switching to forced for the first time, auto-populate the input with the current excluded count
    if (configChanges.mode === 'forced' && cat.config.mode !== 'forced') {
        cat.config.forcedExcludedCount = cat.partition && cat.partition.excluded ? cat.partition.excluded.length : 0;
    }

    // Merge changes
    Object.assign(cat.config, configChanges);

    // Re-process players for this category
    cat.partition = processPlayers(cat.players, cat.config);

    // Save state
    setState({ categories: state.categories });

    if (triggerRender) {
        renderImportResults();
    }
}

// ══════════════════════════════════════════
// Schedule Grid Rendering
// ══════════════════════════════════════════

export function renderScheduleGrid(schedule, containerId, params) {
    const container = document.getElementById(containerId);
    if (!schedule || !schedule.rotations || schedule.rotations.length === 0) {
        container.innerHTML = '<p class="text-center py-10 text-gray-400">Aucun match \u00e0 afficher.</p>';
        return;
    }

    const dark = isDark();

    // Build column widths: rotation + time are narrow, courts share the rest
    let html = '<div class="overflow-x-auto">';
    html += '<table class="schedule-table">';
    html += '<thead><tr>';
    html += '<th class="text-left w-14">Rot.</th>';
    html += '<th class="text-left w-28">Horaire</th>';
    for (let c = 0; c < params.courts; c++) {
        html += `<th>T${c + 1}</th>`;
    }
    html += '</tr></thead><tbody>';

    schedule.rotations.forEach((rot, idx) => {
        html += '<tr>';
        // Rotation label
        html += `<td><span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-500/10 text-brand-600 font-bold text-xs">R${idx + 1}</span></td>`;
        // Time label
        html += `<td class="text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">${rot.timeStart}<br><span class="text-gray-400">${rot.timeEnd}</span></td>`;

        for (let c = 0; c < params.courts; c++) {
            const slot = rot.slots[c];
            if (slot) {
                const colorDef = getCategoryColor(slot.discipline);
                const customHex = getSeriesHexColor(slot.discipline, slot.seriesId);

                let bgColor, txtColor;
                if (customHex && customHex !== colorDef.solid) {
                    bgColor = customHex;
                    const hexCode = customHex.replace('#', '');
                    const r = parseInt(hexCode.substr(0, 2), 16) || 0;
                    const g = parseInt(hexCode.substr(2, 2), 16) || 0;
                    const b = parseInt(hexCode.substr(4, 2), 16) || 0;
                    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                    txtColor = (yiq >= 128) ? '#1f2937' : '#ffffff';
                } else {
                    bgColor = dark ? colorDef.solidDark : colorDef.solid;
                    txtColor = dark ? colorDef.solid : colorDef.solidText;
                }

                const isFinal = slot.phase === 'finale';
                const isSemi = slot.phase === 'demi';
                const phaseLabel = isFinal ? '\uD83C\uDFC6 Finale'
                    : isSemi ? '\u2694\uFE0F Demi'
                        : `Tour ${(slot.match?.round ?? 0) + 1}`;

                // Slight tint effect for finals
                const extraStyle = isFinal
                    ? 'box-shadow: inset 0 0 0 2.5px rgba(255,200,0,0.6);'
                    : isSemi
                        ? 'box-shadow: inset 0 0 0 2px rgba(255,255,255,0.35);'
                        : '';

                html += `<td data-cat="${slot.discipline}">
                  <div class="match-cell${isFinal ? ' final' : ''}"
                    style="background:${bgColor}; color:${txtColor}; ${extraStyle}"
                    title="${slot.label} — ${slot.seriesLabel}">
                    <div style="font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${slot.discipline}</div>
                    <div style="font-size:9px; opacity:0.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${slot.seriesLabel}</div>
                    <span class="match-phase-badge">${phaseLabel}</span>
                  </div>
                </td>`;
            } else {
                const isDisabled = (rot.activeCourts !== undefined && c >= rot.activeCourts);
                if (isDisabled) {
                    html += `<td data-cat="" data-disabled="true"><div class="match-cell" style="background: repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 4px, #f3f4f6 4px, #f3f4f6 8px); opacity:0.5;" title="Terrain désactivé"></div></td>`;
                } else {
                    html += `<td><div class="match-cell empty">&mdash;</div></td>`;
                }
            }
        }
        html += '</tr>';
    });

    html += '</tbody></table></div>';
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

    // Toggle court reduction fields
    const reductionToggle = document.getElementById('param-courts-reduction-enabled');
    const reductionFields = document.getElementById('reduction-fields');
    if (reductionToggle && reductionFields) {
        reductionToggle.addEventListener('change', () => {
            if (reductionToggle.checked) {
                reductionFields.classList.remove('opacity-40', 'pointer-events-none');
            } else {
                reductionFields.classList.add('opacity-40', 'pointer-events-none');
            }
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
                const catClone = JSON.parse(JSON.stringify(state.categories[name]));
                const checkedSeriesIndexes = Array.from(document.querySelectorAll(`.series-checkbox[data-cat="${name}"]:checked`))
                    .map(cb => parseInt(cb.dataset.series));

                if (catClone.partition && catClone.partition.series) {
                    catClone.partition.series = catClone.partition.series.filter((s, originalIdx) => checkedSeriesIndexes.includes(originalIdx));
                }

                if (catClone.partition && catClone.partition.series.length > 0) {
                    selectedCategories[name] = catClone;
                }
            }
        });

        // Read params from inputs
        const reductionEnabled = document.getElementById('param-courts-reduction-enabled')?.checked || false;
        const params = {
            startTime: document.getElementById('param-start-time').value,
            courts: parseInt(document.getElementById('param-courts').value) || 8,
            matchDuration: parseInt(document.getElementById('param-match-duration').value) || 27,
            warmup: parseInt(document.getElementById('param-warmup').value) || 3,
            rest: parseInt(document.getElementById('param-rest').value) || 20,
            courtReduction: reductionEnabled ? {
                reduceTo: parseInt(document.getElementById('param-courts-reduce').value) || null,
                fromRotation: parseInt(document.getElementById('param-courts-reduce-from').value) || 1,
                untilRotation: parseInt(document.getElementById('param-courts-reduce-until').value) || null,
            } : null,
        };
        setParams(params);

        // Generate schedule
        const schedule = buildSchedule(selectedCategories, params);

        // Store the result without triggering a full re-render
        // (calling setState would fire the app.js subscriber → renderImportResults → UI reset)
        const currentState = getState();
        currentState.schedules = { ...currentState.schedules, A: { schedule, categories: selectedCategories } };
        currentState.appliedScenario = 'A';
        try {
            localStorage.setItem('badm_optimizer_state', JSON.stringify(currentState));
        } catch (e) { /* silent */ }

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

    if (!btnApply) return; // Optimizer tab not yet in HTML

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

        const cr = p.courtReduction;
        const toggle = el('param-courts-reduction-enabled');
        const fields = el('reduction-fields');
        if (toggle && fields) {
            if (cr) {
                toggle.checked = true;
                fields.classList.remove('opacity-40', 'pointer-events-none');
                if (cr.reduceTo) el('param-courts-reduce').value = cr.reduceTo;
                if (cr.fromRotation) el('param-courts-reduce-from').value = cr.fromRotation;
                if (cr.untilRotation) el('param-courts-reduce-until').value = cr.untilRotation;
            } else {
                toggle.checked = false;
                fields.classList.add('opacity-40', 'pointer-events-none');
            }
        }
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
