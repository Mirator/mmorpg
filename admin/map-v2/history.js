// @ts-check

import { deepClone } from './state.js';

/**
 * @typedef {{
 *   undo: any[],
 *   redo: any[],
 *   limit: number
 * }} HistoryState
 */

/**
 * @param {number} [limit=100]
 * @returns {HistoryState}
 */
export function createHistory(limit = 100) {
  return {
    undo: [],
    redo: [],
    limit: Math.max(1, Math.floor(limit)),
  };
}

/**
 * @param {HistoryState} history
 * @param {unknown} snapshot
 */
export function pushHistory(history, snapshot) {
  history.undo.push(deepClone(snapshot));
  if (history.undo.length > history.limit) {
    history.undo.shift();
  }
  history.redo.length = 0;
}

/**
 * @param {HistoryState} history
 * @returns {boolean}
 */
export function canUndo(history) {
  return history.undo.length > 0;
}

/**
 * @param {HistoryState} history
 * @returns {boolean}
 */
export function canRedo(history) {
  return history.redo.length > 0;
}

/**
 * @param {HistoryState} history
 * @param {unknown} current
 * @returns {any | null}
 */
export function undo(history, current) {
  if (!history.undo.length) return null;
  const previous = history.undo.pop();
  history.redo.push(deepClone(current));
  return deepClone(previous);
}

/**
 * @param {HistoryState} history
 * @param {unknown} current
 * @returns {any | null}
 */
export function redo(history, current) {
  if (!history.redo.length) return null;
  const next = history.redo.pop();
  history.undo.push(deepClone(current));
  if (history.undo.length > history.limit) {
    history.undo.shift();
  }
  return deepClone(next);
}
