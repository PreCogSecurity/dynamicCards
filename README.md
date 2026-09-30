# dynamicCards

Create and delete simple cards in the browser. A small, deliberately boring
front-end application: no framework, no build step, and **no runtime
dependencies at all** — the whole thing ships as static files.

The test suite is equally dependency-free and runs on Node's built-in test
runner, so a fresh clone needs nothing but Node to install, test and run.

---

## Why it is built this way

dynamicCards is a browser-only app, so the only real attack surface is the DOM.
Three decisions follow from that, and they are the reason this repository is
worth more than the 46-line script it started as:

| Decision | Reason |
| --- | --- |
| Cards are rendered with `createElement` + `textContent`, never `innerHTML` | A card name is untrusted input. Interpolating it into an HTML string and appending it executes whatever the name contains. |
| `index.html` declares a deny-by-default Content-Security-Policy | Even a successful injection cannot load remote code or phone home. |
| State, validation, rendering and wiring are separate modules with tests | The original single file mixed DOM queries, state and string building, and hid three real bugs (see [Defects fixed](#defects-fixed)). |

## Requirements

- **Node.js 22.13 or newer** (see `.nvmrc`; `nvm use` picks it up). The floor is
  set by ESLint 10, the lint toolchain.
- A current browser. Any browser that supports ES modules, `replaceChildren`
  and `:focus-visible` will do — that is every evergreen browser.

There is nothing else to install for *running* the app.

## Configuration

**None.** dynamicCards has no environment variables, no API keys, no
configuration files and no secrets. `.gitignore` still excludes `.env*` and key
material so that a future change cannot accidentally commit them, but today no
part of the app reads from the environment. If you add a setting, add it to this
section and to `.env.example` in the same commit.

## Install

```bash
npm ci
```

`npm ci` installs the three development dependencies (ESLint and its config
packages) and nothing else. `package-lock.json` is committed, so the install is
byte-for-byte reproducible.

The application itself has no dependencies; `npm ci` is only needed for linting.

## Run

```bash
npm start
# dynamicCards is running at http://127.0.0.1:8080/
```

`npm start` runs `tools/serve.js`, a small static server built on `node:http`.
It is used instead of `npx http-server` on purpose: `npx --yes`
downloads and runs an unpinned package at the moment you invoke it, which is an
unreviewed code-execution path in an otherwise dependency-free repository, and
it needs network access to work. This server needs neither.

Options: `npm start -- --port 3000 --host 0.0.0.0`. It binds `127.0.0.1` by
default so it is not exposed to your local network.

You can also open `index.html` directly from disk, or serve the directory with
any static host.

## Test

```bash
npm test          # 94 tests, Node's built-in runner
npm run lint      # ESLint 10, flat config
npm run check     # both, in the order CI runs them
```

The suite runs offline in about two seconds and covers:

- `test/cardName.test.js` — input validation and normalisation.
- `test/cardStore.test.js` — state, identifiers, isolation between instances.
- `test/renderer.test.js` — DOM construction, including that a name like
  `<img src=x onerror=…>` stays inert text.
- `test/app.test.js` — create, delete, validation errors, event delegation,
  and the state/view consistency that the original script got wrong.
- `test/serve.test.js` — the development server's path handling: traversal,
  encoded traversal, null bytes, unpublished files, methods, security headers.
- `test/no-dangerous-sinks.test.js` — scans the shipped source for
  `innerHTML`, `eval`, `console.*` and friends, and asserts the CSP in
  `index.html` is the one we intend to ship.

`test/helpers/domStub.js` is a small DOM implementation used by the tests. It
deliberately **does not implement** `innerHTML`, `outerHTML`,
`insertAdjacentHTML` or `document.write`: touching one throws, so a regression
that reintroduces the XSS fails the suite instead of quietly working. That is
the reason the project needs no jsdom dependency.

## Architecture

```
index.html            page shell, CSP, form markup
main.css              layout and focus styles
src/
  main.js             browser entry point: calls init(), rethrows startup errors
  app.js              element resolution, event wiring, status messages
  cardStore.js        state: add/remove/list, stable ids  (no DOM)
  cardRenderer.js     DOM construction                     (injected document)
  cardName.js         validation and normalisation         (no DOM)
tools/serve.js        zero-dependency static dev server
test/                 node:test suites + the DOM stub
```

Data flows in one direction: `app.js` validates input through `cardStore.js`,
then hands the resulting state to `cardRenderer.js`, which rebuilds the list.
`cardStore.js` and `cardName.js` never touch the DOM, which is what makes them
testable without a browser environment; the `document` is passed into
`cardRenderer.js` rather than read from a global.

### Required element ids

`app.js` resolves these by id and reports every missing one instead of throwing
on the first, so a mismatch between markup and code is a visible, actionable
message rather than a dead page:

| Id | Element | Required |
| --- | --- | --- |
| `newCardName` | text input | yes |
| `createCard` | submit button | yes |
| `addTheDamnCard` | card list container | yes |
| `cardForm` | wrapping `<form>` | no — without it the button is wired directly |
| `cardFormStatus` | live status region | no — validation messages degrade quietly |

## Security

The threat model is small and stated explicitly: a card name is attacker-
controlled input, everything else in the repository is trusted.

- **DOM-based XSS** — names are written with `textContent`; `innerHTML`,
  `outerHTML`, `insertAdjacentHTML`, `eval` and `new Function` are banned in
  `eslint.config.js` and re-checked by `test/no-dangerous-sinks.test.js`.
- **Content Security Policy** — `index.html` sets `default-src 'none'` and
  re-allows only same-origin scripts and styles. `connect-src 'none'` means an
  injected script has nowhere to send data.
- **Input validation** — names are trimmed, stripped of control characters and
  capped at 80 characters (mirrored onto the input's `maxlength`).
- **Headers** — `tools/serve.js` sends `nosniff`, `no-referrer`, `DENY` framing,
  COOP/CORP and `no-store` alongside the CSP.
- **Path traversal** — the dev server confines requests to a published-files
  allowlist, rejects dotfiles, rejects null bytes and malformed percent-
  encoding, and answers 403/404 for any path that resolves outside the root.
- **No secrets, no configuration, no network calls, no analytics, no cookies.**

See [SECURITY.md](SECURITY.md) for how to report a problem.

## Defects fixed

Found while hardening the original 62-line `main.js`; each has a regression
test.

1. **DOM-based XSS.** The card name was interpolated into a template string and
   appended with `innerHTML`. A name of `<img src=x onerror=…>` executed in the
   page's origin.
2. **Broken markup.** The template emitted `id="card_${i}"class="cardAdd"` with
   no space, so `class` was not parsed and the card styling never applied.
3. **Only the last card rendered.** `cardString` was re-initialised inside the
   render loop, so each iteration discarded the previous card.
4. **Duplicate delete listeners.** Every "Create" click re-attached a delete
   handler to *all* existing buttons, so after N cards the first delete button
   fired N handlers and the Nth threw.
5. **State drift on delete.** Deleting a card removed the DOM node but left the
   entry in the `cards` array, so ids derived from array indices pointed at the
   wrong element for the rest of the session.
6. **No null checks.** `document.getElementById(...)` results were used
   unconditionally, so any markup rename produced a `TypeError` on load.
7. **Debug output in production.** Five `console.log` calls and commented-out
   dead code were left in the shipped file.
8. **Broken CI.** The workflow ran `npm ci` and `npm test` in a repository with
   no `package.json`, so it could never have passed.
9. **Invalid HTML.** `index.html` closed `<head>` before the stylesheet link,
   the input had no `<label>`, and there was no error reporting for failed
   validation.

## Contributing

- One change per commit, with its tests in the same commit.
- `npm run check` must pass before you push.
- Do not add a runtime dependency. The zero-dependency property is what makes
  the install reproducible and the attack surface empty; if you truly need one,
  say why in the pull request.

## License

[MIT](LICENSE)
