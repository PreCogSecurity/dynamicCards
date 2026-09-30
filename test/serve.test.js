import assert from 'node:assert/strict';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import {
	CONTENT_SECURITY_POLICY,
	createStaticServer,
	parseArguments,
	resolveRequestPath,
	startServer,
} from '../tools/serve.js';

/**
 * The development server is the only component in this repository that accepts
 * input from a network socket, so its path handling is tested as a security
 * boundary rather than as a convenience feature.
 */

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Send a request over a raw socket so the path is transmitted verbatim. */
function rawRequest(port, requestTarget) {
	return new Promise((resolvePromise, rejectPromise) => {
		const socket = net.connect({ host: '127.0.0.1', port }, () => {
			socket.write(`GET ${requestTarget} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
		});
		let received = '';
		socket.setEncoding('utf8');
		socket.on('data', (chunk) => {
			received += chunk;
		});
		socket.on('end', () => resolvePromise(received));
		socket.on('error', rejectPromise);
	});
}

describe('resolveRequestPath', () => {
	it('maps the site root onto index.html', () => {
		const result = resolveRequestPath(REPOSITORY_ROOT, '/');

		assert.equal(result.ok, true);
		assert.equal(result.relativePath.split(/[\\/]/).pop(), 'index.html');
	});

	it('allows the published application files', () => {
		for (const requestUrl of ['/index.html', '/main.css', '/src/main.js', '/src/app.js']) {
			assert.equal(resolveRequestPath(REPOSITORY_ROOT, requestUrl).ok, true, requestUrl);
		}
	});

	it('refuses repository metadata that the page does not need', () => {
		for (const requestUrl of ['/package.json', '/package-lock.json', '/README.md', '/CHANGELOG.md', '/SECURITY.md']) {
			const result = resolveRequestPath(REPOSITORY_ROOT, requestUrl);
			assert.equal(result.ok, false, requestUrl);
			assert.equal(result.status, 404);
		}
	});

	it('refuses the test and tooling trees', () => {
		for (const requestUrl of ['/test/app.test.js', '/test/helpers/domStub.js', '/tools/serve.js']) {
			assert.equal(resolveRequestPath(REPOSITORY_ROOT, requestUrl).ok, false, requestUrl);
		}
	});

	it('refuses dotfiles', () => {
		for (const requestUrl of ['/.gitignore', '/.env', '/src/.secret']) {
			const result = resolveRequestPath(REPOSITORY_ROOT, requestUrl);
			assert.equal(result.ok, false, requestUrl);
			assert.equal(result.status, 404);
		}
	});

	it('refuses traversal out of the document root', () => {
		for (const requestUrl of [
			'/../package.json',
			'/../../secrets.json',
			'/src/../../.env',
			'/./../../outside.html',
			'/..%2f..%2fetc%2fpasswd',
			'/..%2f..%2fetc%2fpasswd',
		]) {
			const result = resolveRequestPath(REPOSITORY_ROOT, requestUrl);
			assert.equal(result.ok, false, requestUrl);
			assert.ok([403, 404].includes(result.status), `unexpected status for ${requestUrl}: ${result.status}`);
		}
	});

	it('refuses an absolute Windows path smuggled into the request', () => {
		const result = resolveRequestPath(REPOSITORY_ROOT, '/src/..%5C..%5C..%5CWindows%5Cwin.ini');

		assert.equal(result.ok, false);
		assert.ok([403, 404].includes(result.status));
	});

	it('refuses a null byte', () => {
		const result = resolveRequestPath(REPOSITORY_ROOT, '/src/main.js%00.html');

		assert.equal(result.ok, false);
		assert.equal(result.status, 400);
	});

	it('refuses malformed percent-encoding', () => {
		const result = resolveRequestPath(REPOSITORY_ROOT, '/src/%zz.js');

		assert.equal(result.ok, false);
		assert.equal(result.status, 400);
	});

	it('refuses an empty or non-string request target', () => {
		for (const requestUrl of ['', null, undefined, 42]) {
			const result = resolveRequestPath(REPOSITORY_ROOT, requestUrl);
			assert.equal(result.ok, false);
			assert.equal(result.status, 400);
		}
	});

	it('refuses a file type it will not guess at', () => {
		const result = resolveRequestPath(REPOSITORY_ROOT, '/src/run.sh');

		assert.equal(result.ok, false);
		assert.equal(result.status, 404);
	});

	it('accepts a query string without letting it affect the resolved path', () => {
		const result = resolveRequestPath(REPOSITORY_ROOT, '/index.html?debug=1');

		assert.equal(result.ok, true);
		assert.equal(result.relativePath.split(/[\\/]/).pop(), 'index.html');
	});
});

describe('parseArguments', () => {
	it('defaults to loopback on port 8080', () => {
		assert.deepEqual(parseArguments([]), { host: '127.0.0.1', port: 8080 });
	});

	it('accepts both --flag value and --flag=value', () => {
		assert.deepEqual(parseArguments(['--port', '3000']), { host: '127.0.0.1', port: 3000 });
		assert.deepEqual(parseArguments(['--port=3000']), { host: '127.0.0.1', port: 3000 });
		assert.deepEqual(parseArguments(['--host', '0.0.0.0', '--port', '9000']), { host: '0.0.0.0', port: 9000 });
	});

	it('rejects an invalid port instead of silently listening somewhere unexpected', () => {
		for (const argv of [['--port', 'abc'], ['--port', '70000'], ['--port', '-1']]) {
			assert.throws(() => parseArguments(argv), /Invalid port/);
		}
	});
});

describe('the development server over HTTP', () => {
	let server;
	let origin;

	before(async () => {
		server = createStaticServer();
		await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
		origin = `http://127.0.0.1:${server.address().port}`;
	});

	after(async () => {
		await new Promise((resolvePromise) => server.close(resolvePromise));
	});

	it('serves the application shell', async () => {
		const response = await fetch(`${origin}/`);

		assert.equal(response.status, 200);
		assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
		assert.match(await response.text(), /<title>dynamicCards<\/title>/);
	});

	it('serves the ES module entry point with a JavaScript content type', async () => {
		const response = await fetch(`${origin}/src/main.js`);

		assert.equal(response.status, 200);
		assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
		assert.match(await response.text(), /from '\.\/app\.js'/);
	});

	it('sets the hardening headers on every response', async () => {
		const response = await fetch(`${origin}/`);

		assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
		assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
		assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
		assert.equal(response.headers.get('x-frame-options'), 'DENY');
		assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
		assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
		assert.equal(response.headers.get('cache-control'), 'no-store');
	});

	it('sets the hardening headers on error responses too', async () => {
		const response = await fetch(`${origin}/package.json`);

		assert.equal(response.status, 404);
		assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
		assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
	});

	it('answers HEAD without a body but with a length', async () => {
		const response = await fetch(`${origin}/index.html`, { method: 'HEAD' });

		assert.equal(response.status, 200);
		assert.ok(Number(response.headers.get('content-length')) > 0);
		assert.equal(await response.text(), '');
	});

	it('rejects write methods', async () => {
		for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			const response = await fetch(`${origin}/index.html`, { method });
			assert.equal(response.status, 405, method);
			assert.equal(response.headers.get('allow'), 'GET, HEAD');
		}
	});

	it('returns 404 for an unpublished file', async () => {
		const response = await fetch(`${origin}/package.json`);

		assert.equal(response.status, 404);
		assert.doesNotMatch(await response.text(), /"name"/);
	});

	it('returns 404 rather than a directory listing', async () => {
		const response = await fetch(`${origin}/src/`);

		assert.equal(response.status, 404);
	});

	it('returns 400 for a null byte in the target', async () => {
		const response = await fetch(`${origin}/src/main.js%00.html`);

		assert.equal(response.status, 400);
	});

	it('rejects an encoded traversal over a raw socket', async () => {
		// fetch() normalises `..` before it reaches the wire, so the encoded form is
		// sent with a raw request to prove the server itself rejects it.
		const response = await rawRequest(server.address().port, '/%2e%2e%2fpackage.json');

		assert.match(response, /^HTTP\/1\.1 (403|404)/);
		assert.doesNotMatch(response, /"name": "dynamiccards"/i);
	});

	it('rejects a backslash traversal over a raw socket', async () => {
		const response = await rawRequest(server.address().port, '/..%5c..%5cpackage.json');

		assert.match(response, /^HTTP\/1\.1 (403|404)/);
		assert.doesNotMatch(response, /"name": "dynamiccards"/i);
	});

	it('binds loopback only when started through the npm start path', async () => {
		// A development server that listens on every interface by default is a
		// foot-gun on shared and untrusted networks.
		const { server: started, url } = await startServer({ port: 0 });
		try {
			const address = started.address();
			assert.equal(address.address, '127.0.0.1');

			const response = await fetch(url);
			assert.equal(response.status, 200);
			assert.match(await response.text(), /dynamicCards/);
		} finally {
			await new Promise((resolvePromise) => started.close(resolvePromise));
		}
	});
});
