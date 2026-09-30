#!/usr/bin/env node
/**
 * Minimal static file server for local development.
 *
 * Why this exists instead of `npx http-server`: `npx --yes <pkg>` downloads and
 * executes an unpinned package at the moment a developer runs it. That is an
 * unreviewed, unversioned code-execution path in a repository that is otherwise
 * dependency-free, and it requires network access to work at all. This server
 * uses only `node:http` and `node:fs`, so `npm start` works offline, on a fresh
 * clone, with nothing installed.
 *
 * It is also the right place to enforce the response-side half of the page's
 * Content-Security-Policy: the `<meta http-equiv>` tag in index.html protects
 * the document, while the headers set here additionally protect against MIME
 * sniffing, framing and cross-origin leakage.
 *
 * Defaults are least-privilege: loopback only, read-only, no dotfiles, and only
 * the files the page actually needs.
 *
 * Usage:
 *   node tools/serve.js [--port 8080] [--host 127.0.0.1]
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { extname, isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8080;

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Must stay in sync with the `<meta http-equiv>` policy in index.html. */
export const CONTENT_SECURITY_POLICY = [
	"default-src 'none'",
	"script-src 'self'",
	"style-src 'self'",
	"img-src 'self' data:",
	"connect-src 'none'",
	"form-action 'self'",
	"base-uri 'none'",
	"object-src 'none'",
	"frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
	'content-security-policy': CONTENT_SECURITY_POLICY,
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'no-referrer',
	'x-frame-options': 'DENY',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'permissions-policy': 'geolocation=(), camera=(), microphone=()',
	// A development server must never be cached by the browser or a proxy.
	'cache-control': 'no-store',
});

const CONTENT_TYPES = new Map(Object.entries({
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
}));

/**
 * Only these paths are reachable. Everything else — package.json, the lockfile,
 * the test tree, dotfiles such as .git and .env — is a 404, so the development
 * server cannot be used to exfiltrate repository contents.
 */
export const DEFAULT_ALLOWLIST = Object.freeze(['index.html', 'main.css', 'src']);

/**
 * Turn a request URL into a path inside `root`, or a rejection.
 *
 * Exported separately from the HTTP plumbing so the traversal handling can be
 * unit tested directly instead of only through a socket.
 *
 * @param {string} root Absolute path that requests are confined to.
 * @param {string} requestUrl Raw request target, e.g. `/src/../../.env`.
 * @param {ReadonlyArray<string>} [allowlist]
 * @returns {{ok: true, filePath: string, relativePath: string}
 *          | {ok: false, status: 400 | 403 | 404, reason: string}}
 */
export function resolveRequestPath(root, requestUrl, allowlist = DEFAULT_ALLOWLIST) {
	if (typeof requestUrl !== 'string' || requestUrl === '') {
		return { ok: false, status: 400, reason: 'empty request target' };
	}

	let pathname;
	try {
		// Parse against a throwaway origin so that only the path is considered.
		pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost.invalid').pathname);
	} catch {
		return { ok: false, status: 400, reason: 'malformed percent-encoding' };
	}

	if (pathname.includes('\0')) {
		return { ok: false, status: 400, reason: 'null byte in path' };
	}

	if (pathname.endsWith('/')) {
		pathname += 'index.html';
	}

	// Collapse `.` and `..` first, then re-anchor under the root, then verify
	// with a relative path. Verifying the *relative* result is what actually
	// prevents traversal on both POSIX and Windows, where `..\\` is also a
	// parent-directory reference.
	const candidate = resolve(root, `.${normalize(pathname)}`);
	const relativePath = relative(root, candidate);

	if (relativePath === ''
		|| relativePath === '..'
		|| relativePath.startsWith(`..${sep}`)
		|| isAbsolute(relativePath)) {
		return { ok: false, status: 403, reason: 'path escapes the document root' };
	}

	const segments = relativePath.split(/[\\/]/);
	if (segments.some((segment) => segment.startsWith('.') && segment.length > 1)) {
		return { ok: false, status: 404, reason: 'dotfiles are not served' };
	}

	const topLevel = segments[0];
	if (!allowlist.includes(topLevel)) {
		return { ok: false, status: 404, reason: 'path is not published' };
	}

	if (!CONTENT_TYPES.has(extname(relativePath).toLowerCase())) {
		return { ok: false, status: 404, reason: 'unsupported file type' };
	}

	return { ok: true, filePath: candidate, relativePath };
}

async function statFile(filePath) {
	try {
		const stats = await stat(filePath);
		return stats.isFile() ? stats : null;
	} catch {
		return null;
	}
}

function sendPlainText(response, status, message, { includeBody = true } = {}) {
	response.writeHead(status, {
		...SECURITY_HEADERS,
		'content-type': 'text/plain; charset=utf-8',
	});
	response.end(includeBody ? `${message}\n` : undefined);
}

/**
 * Create the development server without starting it, so tests can bind an
 * ephemeral port.
 *
 * @param {{root?: string, allowlist?: ReadonlyArray<string>}} [options]
 */
export function createStaticServer({
	root = REPOSITORY_ROOT,
	allowlist = DEFAULT_ALLOWLIST,
} = {}) {
	const resolvedRoot = resolve(root);

	return createHttpServer(async (request, response) => {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			response.setHeader('allow', 'GET, HEAD');
			sendPlainText(response, 405, 'Method Not Allowed', { includeBody: request.method !== 'HEAD' });
			return;
		}

		const resolution = resolveRequestPath(resolvedRoot, request.url ?? '/', allowlist);
		if (!resolution.ok) {
			sendPlainText(response, resolution.status, resolution.reason, { includeBody: request.method !== 'HEAD' });
			return;
		}

		// resolveRequestPath has already rejected dotfiles, unpublished paths,
		// unknown extensions and anything outside the root, so at this point the
		// only remaining failure is "allowed file that does not exist". Directory
		// listings are impossible: a directory has no servable extension.
		const stats = await statFile(resolution.filePath);
		if (stats === null) {
			sendPlainText(response, 404, 'Not Found', { includeBody: request.method !== 'HEAD' });
			return;
		}

		response.writeHead(200, {
			...SECURITY_HEADERS,
			'content-type': CONTENT_TYPES.get(extname(resolution.filePath).toLowerCase()) ?? 'application/octet-stream',
			'content-length': String(stats.size),
		});

		if (request.method === 'HEAD') {
			response.end();
			return;
		}

		const stream = createReadStream(resolution.filePath);
		stream.on('error', () => response.destroy());
		stream.pipe(response);
	});
}

/** Parse `--port` / `--host` from argv. */
export function parseArguments(argv) {
	const options = { host: DEFAULT_HOST, port: DEFAULT_PORT };
	for (let index = 0; index < argv.length; index += 1) {
		const [flag, inlineValue] = argv[index].split('=');
		const value = inlineValue ?? argv[index + 1];
		const consume = () => {
			if (inlineValue === undefined) {
				index += 1;
			}
		};
		if (flag === '--port' || flag === '-p') {
			consume();
			const port = Number.parseInt(value, 10);
			if (!Number.isInteger(port) || port < 0 || port > 65535) {
				throw new Error(`Invalid port: ${value}`);
			}
			options.port = port;
		} else if (flag === '--host' || flag === '-h') {
			consume();
			options.host = String(value);
		}
	}
	return options;
}

export function startServer({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
	const server = createStaticServer();
	return new Promise((resolvePromise, rejectPromise) => {
		server.once('error', rejectPromise);
		server.listen(port, host, () => {
			const address = server.address();
			resolvePromise({ server, url: `http://${host}:${address.port}/` });
		});
	});
}

const isMainModule = process.argv[1] !== undefined
	&& import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
	try {
		const { host, port } = parseArguments(process.argv.slice(2));
		const { url } = await startServer({ host, port });
		process.stdout.write(`dynamicCards is running at ${url}\nPress Ctrl+C to stop.\n`);
	} catch (error) {
		process.stderr.write(`dynamicCards could not start: ${error.message}\n`);
		process.exitCode = 1;
	}
}
