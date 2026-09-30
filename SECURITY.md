# Security Policy

## Scope

dynamicCards is a static, browser-only application. It has no server-side
component, no database, no accounts, no analytics and no configuration. The
complete set of things an attacker can influence is:

1. **A card name** typed into the form. This is untrusted input.
2. **A request path** sent to the development server in `tools/serve.js`. This is
   untrusted input.

Everything else in the repository — the markup, the styles, the modules — ships
with the application and is trusted.

## What is already in place

| Control | Where |
| --- | --- |
| User text is rendered with `textContent`, never parsed as HTML | `src/cardRenderer.js` |
| HTML-parsing and dynamic-code sinks are lint errors | `eslint.config.js` |
| The same sinks are re-checked by a source scan on every test run | `test/no-dangerous-sinks.test.js` |
| The test DOM stub throws on `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` | `test/helpers/domStub.js` |
| Deny-by-default Content-Security-Policy | `index.html` |
| Response hardening headers | `tools/serve.js` |
| Card names are trimmed, de-controlled and capped at 80 characters | `src/cardName.js` |
| Path traversal, dotfiles, null bytes and bad encoding are rejected | `tools/serve.js`, `test/serve.test.js` |
| No secrets, no environment variables, no third-party requests | repository-wide |

## Supported versions

Only the `master` branch is supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than in a public
issue. Use GitHub's **Report a vulnerability** facility on this repository
(Security → Report a vulnerability), which opens a private advisory.

Please include:

- the affected file and line,
- the input that triggers it,
- what an attacker gains,
- and a reproduction if you have one.

You can expect an acknowledgement within three business days and an assessment
within ten. Fixes for confirmed issues ship as a commit with a regression test
and an entry in [CHANGELOG.md](CHANGELOG.md).

## Out of scope

- The browser's own behaviour, or the security of the CDN or host you deploy to.
- Findings that require a user to deliberately run devtools against their own
  page.
- Denial of service against `tools/serve.js`. It is a local development
  convenience, it binds loopback by default, and it is not intended to be
  exposed to a network. Do report it if you find it reachable from elsewhere
  than `localhost`.
