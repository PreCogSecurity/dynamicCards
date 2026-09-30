/**
 * Card state.
 *
 * A factory rather than a module-level singleton: the previous implementation
 * used a bare `var cards = []` global, which meant state leaked between tests
 * and could be reassigned by any other script on the page. A factory gives each
 * consumer (app instance, unit test) its own isolated store.
 *
 * Cards carry a stable, monotonically increasing `id` instead of relying on
 * their position in the array. The old code derived element ids from the array
 * index, so deleting a card left every later id pointing at the wrong element.
 *
 * This module is pure: no DOM access, no globals, no I/O.
 */

import { normalizeCardName } from './cardName.js';

/**
 * @returns {{
 *   add: (rawName: string) => {ok: true, card: {id: number, name: string}} | {ok: false, error: string},
 *   remove: (id: number) => {ok: true, card: {id: number, name: string}} | {ok: false, error: string},
 *   getAll: () => Array<{id: number, name: string}>,
 *   getById: (id: number) => {id: number, name: string} | null,
 *   size: () => number,
 *   clear: () => void
 * }}
 */
export function createCardStore() {
  /** @type {ReadonlyArray<{id: number, name: string}>} */
  let cards = [];
  let nextId = 1;

  function add(rawName) {
    const result = normalizeCardName(rawName);
    if (!result.ok) {
      return result;
    }

    // Frozen so a caller cannot mutate stored state behind the store's back.
    const card = Object.freeze({ id: nextId, name: result.value });
    nextId += 1;
    cards = cards.concat(card);

    return { ok: true, card };
  }

  function remove(id) {
    const removed = cards.find((card) => card.id === id);
    if (removed === undefined) {
      return { ok: false, error: `Card ${id} no longer exists.` };
    }

    cards = cards.filter((card) => card.id !== id);

    return { ok: true, card: removed };
  }

  /** Defensive copy: callers cannot reorder or drop items by mutating the result. */
  function getAll() {
    return cards.slice();
  }

  function getById(id) {
    return cards.find((card) => card.id === id) ?? null;
  }

  function size() {
    return cards.length;
  }

  function clear() {
    cards = [];
    nextId = 1;
  }

  return Object.freeze({ add, remove, getAll, getById, size, clear });
}
