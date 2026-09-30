/**
 * Card name validation and normalisation.
 *
 * Card names come straight from a user-supplied `<input>`, so they are treated
 * as hostile until proven otherwise. Two independent layers keep markup out of
 * the render path:
 *
 *   1. This module rejects empty, over-long and control-character payloads, so
 *      a card can never hold unbounded or unprintable data.
 *   2. `cardRenderer.js` writes names with `textContent` instead of building
 *      HTML strings, so even a payload that slipped through would be rendered
 *      as inert text rather than executed.
 *
 * The module is pure (no DOM, no globals) so it can be unit tested in isolation.
 */

/** Upper bound on a card name, mirrored onto the input's `maxlength` attribute. */
export const CARD_NAME_MAX_LENGTH = 80;

/**
 * C0 and C1 control characters plus the Unicode line/paragraph separators.
 * These are stripped because they break log lines, terminal output and text
 * extraction, and because they are a common ingredient of filter-evasion
 * payloads. They are removed rather than rejected so that pasting messy data
 * from a spreadsheet still produces a usable card.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the entire purpose of this pattern
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;

export const CARD_NAME_ERRORS = {
  EMPTY: 'Enter a card name before creating a card.',
  TOO_LONG: `Card names are limited to ${CARD_NAME_MAX_LENGTH} characters.`,
};

/**
 * Validate and normalise a raw card name.
 *
 * @param {unknown} rawName Value taken straight from the DOM input.
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function normalizeCardName(rawName) {
  if (typeof rawName !== 'string') {
    return { ok: false, error: CARD_NAME_ERRORS.EMPTY };
  }

  const normalized = rawName.replace(CONTROL_CHARACTERS, '').trim();

  if (normalized.length === 0) {
    return { ok: false, error: CARD_NAME_ERRORS.EMPTY };
  }

  // Length is checked after stripping so that the bound applies to the data we
  // actually store, not to the decoration the user pasted in.
  if (normalized.length > CARD_NAME_MAX_LENGTH) {
    return { ok: false, error: CARD_NAME_ERRORS.TOO_LONG };
  }

  return { ok: true, value: normalized };
}
