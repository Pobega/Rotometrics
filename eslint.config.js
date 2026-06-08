// Flat ESLint config for Rotometrics.
//
// This is a buildless project: browser deps (preact, htm) are loaded at runtime
// via an esm.sh importmap in index.html, not from node_modules. We therefore do
// NOT use eslint-plugin-import — its resolver would fail on the bare `preact`/
// `htm` specifiers. Core ESLint treats those imports as valid syntax, so rules
// like no-undef and no-unused-vars work without any module resolution.
//
// Formatting is owned entirely by Prettier; eslint-config-prettier (applied
// last) turns off any stylistic rules that would conflict with it.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/'] },

  // Bug-catching layer (no-undef, no-unused-vars, no-unreachable, …).
  js.configs.recommended,

  // Deliberate empty catch blocks (best-effort localStorage / teardown) are a
  // legitimate pattern here, so allow them; other empty blocks still error.
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Browser code: the app and all UI/engine/data modules run in the browser.
  {
    files: ['app.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },

  // Node code: the Playwright-driven CI harness. These scripts mix Node globals
  // with browser globals used inside page.evaluate()/waitForFunction() callbacks
  // (which execute in the page), so both global sets apply.
  {
    files: ['ci/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Must come last so Prettier owns formatting decisions.
  prettier,
];
