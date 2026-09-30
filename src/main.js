/**
 * Browser entry point.
 *
 * Deliberately tiny and side-effect free apart from a single `init()` call, so
 * that the rest of the app stays importable from tests without touching a real
 * document.
 *
 * Startup errors are surfaced two ways: as a visible message in the status
 * region, and as a thrown error. The throw reaches the browser's own error
 * console without this file logging anything itself, which keeps diagnostics
 * out of the codebase while still being visible to a developer.
 */

import { init } from './app.js';

const result = init();

if (!result.ok) {
  throw new Error(`dynamicCards failed to initialise: ${result.errors.join('; ')}`);
}
