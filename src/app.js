/**
 * Application wiring: element resolution, event handling and status reporting.
 *
 * Responsibilities kept here (and nowhere else):
 *   - resolve the elements the app needs, failing loudly and specifically when
 *     the markup and the code disagree;
 *   - funnel both the button click and native form submission into one handler;
 *   - translate store results into user-visible messages;
 *   - re-render after every state change.
 *
 * Behaviour fixes relative to the original script:
 *   - Elements are null-checked. The old code called `addEventListener` on
 *     whatever `getElementById` returned, so any rename in the HTML produced a
 *     `TypeError` on load and a silently dead page.
 *   - Deletion is handled by one delegated listener on the list. The old code
 *     re-attached `deleteCard` to *every* existing button on *every* create
 *     click, so after N cards the first delete button fired N handlers.
 *   - Deleting a card now also removes it from the store. Previously the DOM
 *     node was removed while the array kept the stale entry, desynchronising
 *     state from the view and shifting every subsequent card's id.
 *   - Validation errors are surfaced to the user in a live region instead of
 *     being silently accepted.
 */

import { createCardStore } from './cardStore.js';
import { renderCards, CARD_ACTION_ATTRIBUTE, CARD_ID_ATTRIBUTE, DELETE_ACTION } from './cardRenderer.js';
import { CARD_NAME_MAX_LENGTH } from './cardName.js';

export const ELEMENT_IDS = Object.freeze({
  form: 'cardForm',
  nameInput: 'newCardName',
  createButton: 'createCard',
  list: 'addTheDamnCard',
  status: 'cardFormStatus',
});

/** Marks the status region as holding an error for assistive technology. */
const ERROR_CLASS_NAME = 'status--error';

function resolveRequiredElement(doc, id, missing) {
  const element = doc.getElementById(id);
  if (element === null || element === undefined) {
    missing.push(`required element #${id} was not found`);
    return null;
  }
  return element;
}

function setStatus(statusElement, message, { isError = false } = {}) {
  if (statusElement === null) {
    return;
  }
  statusElement.textContent = message;
  statusElement.className = isError ? ERROR_CLASS_NAME : 'status';
}

/**
 * Initialise the card app inside `doc`.
 *
 * Side effects are confined to the elements named by {@link ELEMENT_IDS};
 * nothing is written to globals and no console output is produced.
 *
 * @param {Document} [doc] Defaults to the ambient document (browser entry point).
 * @returns {{ok: true, store: ReturnType<typeof createCardStore>} | {ok: false, errors: string[]}}
 */
export function init(doc = globalThis.document) {
  if (doc === null || typeof doc !== 'object' || typeof doc.getElementById !== 'function') {
    return { ok: false, errors: ['no document is available to initialise the card app'] };
  }

  const missing = [];
  const formElement = doc.getElementById(ELEMENT_IDS.form);
  const nameInput = resolveRequiredElement(doc, ELEMENT_IDS.nameInput, missing);
  const createButton = resolveRequiredElement(doc, ELEMENT_IDS.createButton, missing);
  const listElement = resolveRequiredElement(doc, ELEMENT_IDS.list, missing);
  // The status region is optional: the app must still work without it.
  const statusElement = doc.getElementById(ELEMENT_IDS.status);

  if (missing.length > 0) {
    setStatus(statusElement, `dynamicCards could not start: ${missing.join('; ')}.`, { isError: true });
    return { ok: false, errors: missing };
  }

  const store = createCardStore();

  const render = () => renderCards(doc, listElement, store.getAll());

  function createCardFromInput() {
    const result = store.add(nameInput.value);

    if (!result.ok) {
      setStatus(statusElement, result.error, { isError: true });
      // Native constraint validation keeps the message in the browser's own UI
      // for screen readers and for the case where scripting is degraded.
      if (typeof nameInput.setCustomValidity === 'function') {
        nameInput.setCustomValidity(result.error);
      }
      return;
    }

    setStatus(statusElement, `Added card "${result.card.name}".`);
    nameInput.value = '';
    if (typeof nameInput.setCustomValidity === 'function') {
      nameInput.setCustomValidity('');
    }
    render();
  }

  function deleteCardFromEvent(event) {
    const trigger = typeof event.target?.closest === 'function'
      ? event.target.closest(`[${CARD_ACTION_ATTRIBUTE}="${DELETE_ACTION}"]`)
      : null;

    // Ignore clicks on the card body or on anything outside our own list.
    if (trigger === null || !listElement.contains(trigger)) {
      return;
    }

    const rawId = trigger.getAttribute(CARD_ID_ATTRIBUTE);
    const id = Number.parseInt(rawId, 10);
    if (!Number.isInteger(id)) {
      return;
    }

    const result = store.remove(id);
    if (!result.ok) {
      setStatus(statusElement, result.error, { isError: true });
      return;
    }

    setStatus(statusElement, `Deleted card "${result.card.name}".`);
    render();
  }

  // One delegated listener for the whole list: no listener bookkeeping, and it
  // stays correct as cards are added and removed.
  listElement.addEventListener('click', deleteCardFromEvent);

  if (formElement !== null && formElement !== undefined) {
    // Preferred path: a real <form> gives keyboard and assistive-technology
    // users submit-on-Enter and correct form semantics for free.
    createButton.type = 'submit';
    formElement.addEventListener('submit', (event) => {
      event.preventDefault();
      createCardFromInput();
    });
  } else {
    createButton.type = 'button';
    createButton.addEventListener('click', createCardFromInput);
  }

  // Enforce the bound in the browser too, so a paste cannot exceed it before
  // validation runs.
  nameInput.setAttribute('maxlength', String(CARD_NAME_MAX_LENGTH));

  render();

  return { ok: true, store };
}
