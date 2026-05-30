/**
 * store.js — Centralized state management + localStorage persistence
 */

const STORAGE_KEY = 'badm_optimizer_state';

const defaultState = {
  // Players data
  players: [],         // Array of { name, sex, points, isDefault, rank }
  playersRaw: [],      // Raw imported data before processing

  // Generated categories and partition results
  categories: {},      // e.g. { "SI MIN S6": { players: [], partition: { series, excluded } } }

  // Schedule parameters
  params: {
    startTime: '08:00',
    courts: 8,
    matchDuration: 27,
    warmup: 3,
    rest: 20,
    courtsReduceTo: null,
    courtsReduceFromRotation: null,
  },

  // Generated schedules
  schedules: {
    A: null,  // Standard scenario
    B: null,  // Alternative partition
    C: null,  // Optimized with exclusions
  },
  activeScenario: 'A',
  appliedScenario: null,

  // UI state
  theme: 'dark',
  activeTab: 'import',
};

let _state = null;
let _listeners = [];

/**
 * Initialize the store: load from localStorage or use defaults
 */
export function initStore() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      _state = { ...defaultState, ...JSON.parse(saved) };
      // Merge nested objects
      _state.params = { ...defaultState.params, ..._state.params };
      _state.schedules = { ...defaultState.schedules, ..._state.schedules };
    } catch (e) {
      console.warn('Invalid saved state, resetting.', e);
      _state = { ...defaultState };
    }
  } else {
    _state = { ...defaultState };
  }
  return _state;
}

/**
 * Get current state (read-only copy)
 */
export function getState() {
  return _state;
}

/**
 * Update state partially and persist
 */
export function setState(partial) {
  _state = { ..._state, ...partial };
  _persist();
  _notify();
}

/**
 * Update nested params
 */
export function setParams(partial) {
  _state.params = { ..._state.params, ...partial };
  _persist();
  _notify();
}

/**
 * Subscribe to state changes
 */
export function subscribe(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

/**
 * Full reset
 */
export function resetStore() {
  _state = { ...defaultState };
  localStorage.removeItem(STORAGE_KEY);
  _notify();
}

// ── Internals ──
function _persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) {
    console.warn('Failed to persist state', e);
  }
}

function _notify() {
  _listeners.forEach(fn => fn(_state));
}
