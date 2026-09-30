/**
 * ESLint flat configuration.
 *
 * The rule set is deliberately stricter than `js.configs.recommended` in three
 * places that matter for this application:
 *
 *   - `no-restricted-properties` / `no-restricted-globals` make the HTML-parsing
 *     and dynamic-code sinks a lint error, so the anti-XSS contract in
 *     src/cardRenderer.js is caught at review time as well as by the test suite;
 *   - `no-console` in `src/` keeps debug output out of shipped code;
 *   - `no-var` plus `prefer-const`/`eqeqeq` replace the `var`-heavy original.
 *
 * Only three first-party development dependencies are involved; the application
 * itself ships no dependencies at all.
 */

import js from '@eslint/js';
import globals from 'globals';

const SINK_MESSAGE = 'Build nodes with createElement/textContent instead of parsing HTML, so user-supplied text can never execute.';

export default [
	{
		ignores: ['node_modules/**', 'coverage/**', '**/.eslintcache'],
	},

	js.configs.recommended,

	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: 'module',
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
		},
		rules: {
			curly: ['error', 'all'],
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			'no-var': 'error',
			'prefer-const': 'error',
			'no-implicit-coercion': ['error', { boolean: false }],
			'no-param-reassign': 'error',
			'no-shadow': 'error',
			'object-shorthand': ['error', 'always'],
			'prefer-template': 'error',
			strict: ['error', 'never'],
			// Sinks that would reintroduce a DOM-based XSS or dynamic code execution.
			'no-restricted-globals': [
				'error',
				{ name: 'eval', message: 'Dynamic code execution is prohibited.' },
				{ name: 'Function', message: 'Dynamic code execution is prohibited.' },
			],
			'no-restricted-properties': [
				'error',
				{ property: 'innerHTML', message: SINK_MESSAGE },
				{ property: 'outerHTML', message: SINK_MESSAGE },
				{ object: 'document', property: 'write', message: SINK_MESSAGE },
				{ object: 'document', property: 'writeln', message: SINK_MESSAGE },
			],
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
					message: SINK_MESSAGE,
				},
				{
					selector: "NewExpression[callee.name='Function']",
					message: 'Dynamic code execution is prohibited.',
				},
			],
		},
	},

	{
		// Browser code: no Node globals, no console output in shipped source.
		files: ['src/**/*.js'],
		languageOptions: {
			globals: globals.browser,
		},
		rules: {
			'no-console': 'error',
		},
	},

	{
		// Tests and tooling run in Node, where console output in a failing test is
		// diagnostic rather than a leak.
		files: ['test/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'no-console': 'off',
		},
	},
];
