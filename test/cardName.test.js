import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CARD_NAME_ERRORS, CARD_NAME_MAX_LENGTH, normalizeCardName } from '../src/cardName.js';

describe('normalizeCardName', () => {
	it('accepts a normal name unchanged', () => {
		assert.deepEqual(normalizeCardName('Alpha card'), { ok: true, value: 'Alpha card' });
	});

	it('trims surrounding whitespace', () => {
		assert.deepEqual(normalizeCardName('  padded \t\n'), { ok: true, value: 'padded' });
	});

	it('rejects an empty or whitespace-only name', () => {
		for (const value of ['', '   ', '\t\n']) {
			assert.deepEqual(normalizeCardName(value), { ok: false, error: CARD_NAME_ERRORS.EMPTY });
		}
	});

	it('rejects a name that is not a string', () => {
		// The old code trusted `input.value` implicitly; a null or object slipping
		// through would have been coerced into the string "null"/"[object Object]".
		for (const value of [null, undefined, 42, {}, [], true]) {
			assert.deepEqual(normalizeCardName(value), { ok: false, error: CARD_NAME_ERRORS.EMPTY });
		}
	});

	it('rejects a name longer than the documented limit', () => {
		const tooLong = 'a'.repeat(CARD_NAME_MAX_LENGTH + 1);
		assert.deepEqual(normalizeCardName(tooLong), { ok: false, error: CARD_NAME_ERRORS.TOO_LONG });
	});

	it('accepts a name exactly at the limit', () => {
		const atLimit = 'a'.repeat(CARD_NAME_MAX_LENGTH);
		assert.deepEqual(normalizeCardName(atLimit), { ok: true, value: atLimit });
	});

	it('measures length after control characters are stripped', () => {
		// A payload padded with control characters must not be able to smuggle
		// more than CARD_NAME_MAX_LENGTH characters into stored state.
		const padded = `\u0000\u0001${'a'.repeat(CARD_NAME_MAX_LENGTH)}\u0002`;
		assert.deepEqual(normalizeCardName(padded), { ok: true, value: 'a'.repeat(CARD_NAME_MAX_LENGTH) });
	});

	it('strips C0/C1 control characters and Unicode separators', () => {
		const dirty = 're\u0000po\u0007rt\u009f\u2028ca\u2029rd';
		assert.deepEqual(normalizeCardName(dirty), { ok: true, value: 'reportcard' });
	});

	it('preserves markup characters verbatim so the renderer decides their meaning', () => {
		// Validation must not silently "clean" a payload into something safe-looking:
		// the guarantee comes from rendering with textContent, not from mangling data.
		const payload = '<img src=x onerror="alert(1)">';
		assert.deepEqual(normalizeCardName(payload), { ok: true, value: payload });
	});

	it('does not trim characters that are meaningful inside a name', () => {
		assert.deepEqual(normalizeCardName('  spaced  out  '), { ok: true, value: 'spaced  out' });
	});
});
