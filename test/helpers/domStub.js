/**
 * Minimal DOM stub for tests.
 *
 * Why this exists instead of jsdom: this project ships zero runtime and zero dev
 * dependencies, which means there is no npm supply-chain surface and the suite
 * runs offline on a fresh clone with nothing but Node itself. A hand-written
 * stub is a few dozen more lines than jsdom, but it also lets us do something a
 * general-purpose library cannot do — refuse to implement the dangerous sinks:
 *
 *   innerHTML / outerHTML / insertAdjacentHTML / document.write
 *
 * Any production code that reaches for one of them fails the test immediately
 * with an explanatory error rather than silently working. That turns the
 * anti-XSS contract in src/cardRenderer.js into something the test suite
 * actually enforces.
 *
 * Supported selectors (deliberately minimal, and it throws on anything else so
 * that a silent false negative is impossible): tag names, `.class`, `#id`,
 * `[attr]` and `[attr="value"]`.
 */

const HTML_PARSE_SINKS = ['innerHTML', 'outerHTML'];

function sinkError(sink) {
	return new Error(
		`The test DOM does not implement ${sink}. Production code must build nodes with `
		+ 'createElement/textContent so that user-supplied text can never be parsed as markup.',
	);
}

/** Selector matching for the small subset the app uses. */
function matchesSelector(element, selector) {
	const s = String(selector).trim();

	if (s === '*') {
		return true;
	}

	if (s.startsWith('[')) {
		const match = /^\[([A-Za-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]$/.exec(s);
		if (match === null) {
			throw new Error(`Unsupported selector in the test DOM stub: ${selector}`);
		}
		const [, name, doubleQuoted, singleQuoted, bare] = match;
		if (!element.hasAttribute(name)) {
			return false;
		}
		const expected = doubleQuoted ?? singleQuoted ?? bare;
		return expected === undefined || element.getAttribute(name) === expected;
	}

	if (s.startsWith('.')) {
		return element.className.split(/\s+/).includes(s.slice(1));
	}

	if (s.startsWith('#')) {
		return element.id === s.slice(1);
	}

	return element.tagName === s.toUpperCase();
}

export class StubElement {
	constructor(tagName) {
		if (typeof tagName !== 'string' || tagName.trim() === '') {
			throw new TypeError('createElement requires a non-empty tag name');
		}

		this.tagName = tagName.trim().toUpperCase();
		this.nodeName = this.tagName;
		this.attributes = new Map();
		this.childNodes = [];
		this.parentNode = null;
		/** Mirrors the DOM's `input.value` property, which is not reflected. */
		this.value = '';
		this.validity = { valid: true, customErrorMessage: '' };
		this._text = '';
		this._listeners = new Map();
	}

	// --- attributes -------------------------------------------------------

	setAttribute(name, value) {
		this.attributes.set(String(name), String(value));
	}

	getAttribute(name) {
		return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
	}

	hasAttribute(name) {
		return this.attributes.has(String(name));
	}

	removeAttribute(name) {
		this.attributes.delete(String(name));
	}

	get className() {
		return this.getAttribute('class') ?? '';
	}

	set className(value) {
		this.setAttribute('class', value);
	}

	get id() {
		return this.getAttribute('id') ?? '';
	}

	set id(value) {
		this.setAttribute('id', value);
	}

	get type() {
		return this.getAttribute('type') ?? '';
	}

	set type(value) {
		this.setAttribute('type', value);
	}

	// --- content ----------------------------------------------------------

	get textContent() {
		if (this.childNodes.length === 0) {
			return this._text;
		}
		return this.childNodes.map((child) => child.textContent).join('');
	}

	set textContent(value) {
		for (const child of this.childNodes) {
			child.parentNode = null;
		}
		this.childNodes = [];
		this._text = String(value);
	}

	// --- tree -------------------------------------------------------------

	get children() {
		return this.childNodes.slice();
	}

	get firstElementChild() {
		return this.childNodes[0] ?? null;
	}

	appendChild(child) {
		if (child.parentNode !== null) {
			child.parentNode.removeChild(child);
		}
		child.parentNode = this;
		this.childNodes.push(child);
		return child;
	}

	removeChild(child) {
		const index = this.childNodes.indexOf(child);
		if (index === -1) {
			throw new Error('NotFoundError: the node to remove is not a child of this node');
		}
		this.childNodes.splice(index, 1);
		child.parentNode = null;
		return child;
	}

	replaceChildren(...nodes) {
		for (const child of this.childNodes) {
			child.parentNode = null;
		}
		this.childNodes = [];
		for (const node of nodes) {
			this.appendChild(node);
		}
	}

	remove() {
		if (this.parentNode !== null) {
			this.parentNode.removeChild(this);
		}
	}

	contains(node) {
		let current = node;
		while (current !== null && current !== undefined) {
			if (current === this) {
				return true;
			}
			current = current.parentNode;
		}
		return false;
	}

	// --- traversal --------------------------------------------------------

	matches(selector) {
		return matchesSelector(this, selector);
	}

	closest(selector) {
		let current = this;
		while (current !== null && current !== undefined) {
			if (typeof current.matches === 'function' && current.matches(selector)) {
				return current;
			}
			current = current.parentNode;
		}
		return null;
	}

	querySelectorAll(selector) {
		const found = [];
		const visit = (node) => {
			for (const child of node.childNodes) {
				if (child.matches(selector)) {
					found.push(child);
				}
				visit(child);
			}
		};
		visit(this);
		return found;
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	// --- constraint validation --------------------------------------------

	setCustomValidity(message) {
		this.validity = { valid: message === '' || message == null, customErrorMessage: String(message ?? '') };
	}

	// --- events -----------------------------------------------------------

	addEventListener(type, handler) {
		if (typeof handler !== 'function') {
			throw new TypeError('addEventListener requires a function');
		}
		const handlers = this._listeners.get(type) ?? [];
		handlers.push(handler);
		this._listeners.set(type, handlers);
	}

	removeEventListener(type, handler) {
		const handlers = this._listeners.get(type);
		if (handlers === undefined) {
			return;
		}
		const index = handlers.indexOf(handler);
		if (index !== -1) {
			handlers.splice(index, 1);
		}
	}

	/** Total registered handlers for a type; lets tests prove there is no listener leak. */
	listenerCount(type) {
		return (this._listeners.get(type) ?? []).length;
	}

	dispatchEvent(event) {
		if (event === null || typeof event !== 'object' || typeof event.type !== 'string') {
			throw new TypeError('dispatchEvent requires an event object with a type');
		}
		if (event.target == null) {
			event.target = this;
		}

		let node = this;
		while (node !== null && node !== undefined) {
			const handlers = node._listeners.get(event.type);
			if (handlers !== undefined) {
				event.currentTarget = node;
				for (const handler of handlers.slice()) {
					handler.call(node, event);
				}
			}
			if (event._stopped === true) {
				break;
			}
			node = node.parentNode;
		}

		return event.defaultPrevented !== true;
	}
}

// Refuse the HTML-parsing sinks outright (see the module comment).
for (const sink of HTML_PARSE_SINKS) {
	Object.defineProperty(StubElement.prototype, sink, {
		get() {
			throw sinkError(sink);
		},
		set() {
			throw sinkError(sink);
		},
		configurable: true,
	});
}

for (const method of ['insertAdjacentHTML', 'write']) {
	Object.defineProperty(StubElement.prototype, method, {
		value() {
			throw sinkError(method);
		},
		configurable: true,
		writable: true,
	});
}

/** Create a plain event object with the shape the app relies on. */
export function createDomEvent(type, { target = null } = {}) {
	return {
		type,
		target,
		currentTarget: null,
		defaultPrevented: false,
		_stopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this._stopped = true;
		},
	};
}

function findById(root, id) {
	if (root.matches(`#${id}`)) {
		return root;
	}
	for (const child of root.childNodes) {
		const match = findById(child, id);
		if (match !== null) {
			return match;
		}
	}
	return null;
}

/** An empty document with a documentElement and a body. */
export function createDocument() {
	const doc = {
		createElement(tagName) {
			return new StubElement(tagName);
		},
		getElementById(id) {
			return findById(doc.documentElement, id);
		},
		write() {
			throw sinkError('document.write');
		},
	};

	doc.documentElement = new StubElement('html');
	doc.body = doc.createElement('body');
	doc.documentElement.appendChild(doc.body);

	return doc;
}

/**
 * A document laid out like index.html: the form, the input, the create button,
 * the live status region and the card list.
 */
export function createAppDocument() {
	const doc = createDocument();

	const form = doc.createElement('form');
	form.id = 'cardForm';

	const label = doc.createElement('label');
	label.setAttribute('for', 'newCardName');

	const row = doc.createElement('div');

	const input = doc.createElement('input');
	input.id = 'newCardName';
	input.type = 'text';
	input.setAttribute('maxlength', '80');

	const button = doc.createElement('button');
	button.id = 'createCard';
	button.type = 'submit';

	const status = doc.createElement('p');
	status.id = 'cardFormStatus';
	status.className = 'status';
	status.setAttribute('role', 'status');

	row.appendChild(input);
	row.appendChild(button);
	form.appendChild(label);
	form.appendChild(row);
	form.appendChild(status);

	const list = doc.createElement('ul');
	list.id = 'addTheDamnCard';
	list.className = 'card-list';

	doc.body.appendChild(form);
	doc.body.appendChild(list);

	return doc;
}
