import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Repository-wide security regression guard.
 *
 * The app renders user-supplied card names. Any use of an HTML-parsing or
 * dynamic-code sink in the shipped source would reintroduce a DOM-based XSS, so
 * the source tree is scanned for them on every test run. The DOM stub's refusal
 * to implement these sinks covers the render path at runtime; this test covers
 * every other module.
 *
 * Comments are stripped before scanning, because the renderer documents the very
 * sinks it must never call.
 */

const SOURCE_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const INDEX_HTML = fileURLToPath(new URL('../index.html', import.meta.url));

const FORBIDDEN_SINKS = [
	{ name: 'innerHTML', pattern: /\.innerHTML\b/ },
	{ name: 'outerHTML', pattern: /\.outerHTML\b/ },
	{ name: 'insertAdjacentHTML', pattern: /insertAdjacentHTML\s*\(/ },
	{ name: 'document.write', pattern: /document\s*\.\s*write(?:ln)?\s*\(/ },
	{ name: 'eval', pattern: /\beval\s*\(/ },
	{ name: 'new Function', pattern: /new\s+Function\s*\(/ },
	{ name: 'setTimeout with a string body', pattern: /setTimeout\s*\(\s*['"`]/ },
	{ name: 'setInterval with a string body', pattern: /setInterval\s*\(\s*['"`]/ },
	{ name: 'non-module script src', pattern: /<script(?![^>]*\btype\s*=\s*["']module["'])/ },
];

/**
 * Remove comments while preserving string and template literals, so that a sink
 * name mentioned inside a string (or a comment) is not reported.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
	let output = '';
	let index = 0;

	const states = { NORMAL: 0, LINE: 1, BLOCK: 2, SINGLE: 3, DOUBLE: 4, TEMPLATE: 5 };
	let state = states.NORMAL;

	while (index < source.length) {
		const char = source[index];
		const next = source[index + 1];

		if (state === states.NORMAL) {
			if (char === '/' && next === '/') {
				state = states.LINE;
				index += 2;
				continue;
			}
			if (char === '/' && next === '*') {
				state = states.BLOCK;
				index += 2;
				continue;
			}
			if (char === "'") {
				state = states.SINGLE;
			} else if (char === '"') {
				state = states.DOUBLE;
			} else if (char === '`') {
				state = states.TEMPLATE;
			}
			output += char;
			index += 1;
			continue;
		}

		if (state === states.LINE) {
			if (char === '\n') {
				state = states.NORMAL;
				output += char;
			}
			index += 1;
			continue;
		}

		if (state === states.BLOCK) {
			if (char === '*' && next === '/') {
				state = states.NORMAL;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}

		// Inside a string or template literal: copy verbatim, honouring escapes.
		output += char;
		index += 1;
		if (char === '\\') {
			if (index < source.length) {
				output += source[index];
				index += 1;
			}
			continue;
		}
		if (
			(state === states.SINGLE && char === "'")
			|| (state === states.DOUBLE && char === '"')
			|| (state === states.TEMPLATE && char === '`')
		) {
			state = states.NORMAL;
		}
	}

	return output;
}

async function readSourceFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			files.push(...await readSourceFiles(join(directory, entry.name)));
		} else if (entry.name.endsWith('.js')) {
			files.push(join(directory, entry.name));
		}
	}
	return files;
}

describe('security regression guard', () => {
	it('finds the source files it is meant to scan', async () => {
		const files = await readSourceFiles(SOURCE_DIR);
		assert.ok(files.length >= 5, `expected the modular source tree, found ${files.length} file(s)`);
	});

	for (const sink of FORBIDDEN_SINKS.filter((entry) => !entry.pattern.source.startsWith('<'))) {
		it(`keeps ${sink.name} out of the shipped source`, async () => {
			const files = await readSourceFiles(SOURCE_DIR);
			const offenders = [];

			for (const file of files) {
				const code = stripComments(await readFile(file, 'utf8'));
				if (sink.pattern.test(code)) {
					offenders.push(file);
				}
			}

			assert.deepEqual(offenders, [], `${sink.name} must not appear in shipped source`);
		});
	}

	it('keeps the console out of the shipped source', async () => {
		// Debug logging in production code leaks internals and was one of the
		// findings in the original script.
		const files = await readSourceFiles(SOURCE_DIR);
		const offenders = [];

		for (const file of files) {
			if (/\bconsole\s*\./.test(stripComments(await readFile(file, 'utf8')))) {
				offenders.push(file);
			}
		}

		assert.deepEqual(offenders, [], 'production code must not write to the console');
	});

	it('loads no script from another origin and defines a restrictive CSP', async () => {
		const html = await readFile(INDEX_HTML, 'utf8');

		const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html);
		assert.ok(csp !== null, 'index.html must declare a Content-Security-Policy');

		const directives = Object.fromEntries(
			csp[1].split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
				const [name, ...values] = part.split(/\s+/);
				return [name, values];
			}),
		);

		assert.deepEqual(directives['default-src'], ["'none'"], 'the default must deny everything');
		assert.deepEqual(directives['script-src'], ["'self'"], 'scripts must come from this origin only');
		assert.deepEqual(directives['style-src'], ["'self'"], 'no inline styles');
		assert.deepEqual(directives['connect-src'], ["'none'"], 'no exfiltration channel');
		assert.deepEqual(directives['object-src'], ["'none'"]);
		assert.deepEqual(directives['base-uri'], ["'none'"]);

		// No http(s):// or protocol-relative resource references anywhere on the page.
		const resourceReferences = html.match(/\b(?:src|href)\s*=\s*"([^"]*)"/gi) ?? [];
		for (const reference of resourceReferences) {
			assert.doesNotMatch(
				reference,
				/=\s*"(?:https?:)?\/\//i,
				`the page must not reference a remote resource: ${reference}`,
			);
		}
	});

	it('declares no inline event-handler attributes', async () => {
		const html = await readFile(INDEX_HTML, 'utf8');

		assert.doesNotMatch(stripComments(html), /\son[a-z]+\s*=/i, 'inline handlers defeat the CSP');
	});
});
