import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCardStore } from '../src/cardStore.js';
import { CARD_NAME_ERRORS } from '../src/cardName.js';

describe('createCardStore', () => {
	it('adds a card and returns it', () => {
		const store = createCardStore();

		const result = store.add('Alpha');

		assert.equal(result.ok, true);
		assert.deepEqual({ ...result.card }, { id: 1, name: 'Alpha' });
		assert.equal(store.size(), 1);
	});

	it('normalises the name on the way in', () => {
		const store = createCardStore();

		assert.deepEqual({ ...store.add('  Alpha  ').card }, { id: 1, name: 'Alpha' });
	});

	it('refuses to add an invalid card and leaves state untouched', () => {
		const store = createCardStore();

		const result = store.add('   ');

		assert.deepEqual(result, { ok: false, error: CARD_NAME_ERRORS.EMPTY });
		assert.equal(store.size(), 0);
		assert.deepEqual(store.getAll(), []);
	});

	it('gives every card a unique id', () => {
		const store = createCardStore();

		const ids = ['a', 'b', 'c'].map((name) => store.add(name).card.id);

		assert.deepEqual(ids, [1, 2, 3]);
	});

	it('removes a card by id and returns it', () => {
		const store = createCardStore();
		store.add('Alpha');
		store.add('Beta');

		const result = store.remove(1);

		assert.equal(result.ok, true);
		assert.deepEqual({ ...result.card }, { id: 1, name: 'Alpha' });
		assert.deepEqual(store.getAll().map((card) => card.name), ['Beta']);
	});

	it('reports a miss instead of throwing when the id is unknown', () => {
		const store = createCardStore();
		store.add('Alpha');

		assert.deepEqual(store.remove(999), { ok: false, error: 'Card 999 no longer exists.' });
		assert.equal(store.size(), 1);
	});

	it('never reuses an id after a delete', () => {
		const store = createCardStore();
		store.add('Alpha');
		store.remove(1);

		// Reusing ids would let a stale DOM node delete a different card.
		assert.equal(store.add('Beta').card.id, 2);
	});

	it('returns a defensive copy from getAll', () => {
		const store = createCardStore();
		store.add('Alpha');

		const snapshot = store.getAll();
		snapshot.push({ id: 99, name: 'Injected' });

		assert.equal(store.size(), 1);
		assert.equal(store.getById(99), null);
	});

	it('freezes stored cards so callers cannot mutate state in place', () => {
		const store = createCardStore();
		const { card } = store.add('Alpha');

		assert.throws(() => {
			card.name = 'Tampered';
		}, TypeError);
		assert.equal(store.getById(1).name, 'Alpha');
	});

	it('returns a frozen store surface', () => {
		const store = createCardStore();

		assert.equal(Object.isFrozen(store), true);
	});

	it('clears all state and restarts ids', () => {
		const store = createCardStore();
		store.add('Alpha');
		store.add('Beta');

		store.clear();

		assert.equal(store.size(), 0);
		assert.equal(store.add('Gamma').card.id, 1);
	});

	it('keeps separate state per instance', () => {
		// The original module used a shared `var cards = []`, which leaked between
		// consumers; a factory must not.
		const first = createCardStore();
		const second = createCardStore();

		first.add('Only in first');

		assert.equal(first.size(), 1);
		assert.equal(second.size(), 0);
	});
});
