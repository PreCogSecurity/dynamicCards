# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [2.0.0] - 2026-09-30

First release with a test suite, a lint gate and a working CI pipeline. The
behaviour of the app is unchanged from a user's point of view; the internal
structure, the security posture and the engineering process are not.

### Security

- **Fixed a DOM-based XSS.** Card names were interpolated into an HTML string
  and appended with `innerHTML`, so a name such as
  `<img src=x onerror="…">` executed in the page's origin. Cards are now built
  with `createElement` and written with `textContent`.
- Added a deny-by-default Content-Security-Policy to `index.html`
  (`default-src 'none'`, same-origin scripts and styles only, `connect-src 'none'`).
- Added response hardening headers to the development server: `nosniff`,
  `no-referrer`, `DENY` framing, COOP, CORP and `no-store`.
- Removed five `console.log` calls that were leaking internal state, and the
  commented-out dead code next to them.
- Banned `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
  `eval` and `new Function` in `eslint.config.js`, with a source scan
  (`test/no-dangerous-sinks.test.js`) as a second gate.
- Hardened the development server's request handling: path traversal, encoded
  and backslash traversal, null bytes, malformed percent-encoding, dotfiles and
  unpublished files are all rejected, and only `index.html`, `main.css` and
  `src/` are served.

### Added

- `package.json` with `start`, `test`, `lint`, `check` and `audit` scripts, plus
  a committed `package-lock.json` for reproducible installs.
- A 94-test suite on Node's built-in test runner, with no test dependencies.
  `npm ci && npm test` now passes on a fresh clone, which it could not before.
- A minimal DOM stub for the tests that refuses to implement `innerHTML` and
  friends, so a reintroduced XSS fails the suite instead of passing quietly.
- ESLint 10 with a flat config; `npm run lint` and a lint step in CI.
- `tools/serve.js`: a zero-dependency static server for `npm start`, replacing
  the unpinned `npx http-server` download the README used to imply.
- A real `README.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE`, `.nvmrc`, an
  expanded `.gitignore`, and a hardened CI workflow.

### Fixed

- Only the last card was ever rendered: `cardString` was re-initialised inside
  the render loop, discarding every previous card.
- Cards were never actually styled: the generated markup was missing a space
  between `id` and `class`, so the `class` attribute was not parsed.
- Delete handlers were re-attached to every existing button on every "Create"
  click, so one click on a delete button eventually threw.
- Deleting a card removed the DOM node but left the entry in the `cards` array,
  desynchronising state from the view and shifting every later card's id.
- A missing DOM element produced an uncaught `TypeError` on page load; missing
  elements are now collected and reported.
- Invalid HTML in `index.html`: the stylesheet was linked after `</head>`, and
  the text input had no associated `<label>`.

### Changed

- Split the single `main.js` into `src/cardName.js`, `src/cardStore.js`,
  `src/cardRenderer.js`, `src/app.js` and `src/main.js`. The pure modules touch
  no DOM, and the renderer takes its `document` as an argument, so every layer
  is testable in isolation.
- Card names are validated: trimmed, stripped of C0/C1 control characters and
  capped at 80 characters, with the limit mirrored onto the input's `maxlength`.
- Cards are identified by a stable id instead of their array index, and the
  state is per-instance rather than a shared global.
- Delete handling uses one delegated listener on the list container.
- The form is a real `<form>`, restoring submit-on-Enter and correct assistive
  technology semantics; the card list is a real `<ul>`/`<li>` list, and the
  delete control has an `aria-label` naming the card it removes.
- Validation and status messages are shown in a live region instead of being
  silently accepted.
- The card list re-renders wholesale, so it can never drift from the store.
- `var` replaced with `const`/`let` throughout, tabs retained for indentation.

### Removed

- The root-level `main.js`, replaced by the `src/` module tree.
- The shared `var cards = []` global.

[Unreleased]: https://github.com/PreCogSecurity/dynamicCards/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/PreCogSecurity/dynamicCards/releases/tag/v2.0.0
