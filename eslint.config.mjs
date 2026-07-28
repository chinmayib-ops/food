// Flat ESLint config — a lightweight *correctness* lint for a zero-build,
// vanilla-JS app. It pairs with `node --check` in CI (the syntax gate that
// would have caught the duplicate-`const` bug). Rules here focus on real
// bugs; stylistic and "undeclared global" checks are intentionally left off
// because this codebase shares implicit globals across <script> tags, so
// no-undef would be all false positives.
export default [
  {
    files: ['**/*.js'],
    ignores: ['scripts/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    rules: {
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': ['error', 'always'],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unsafe-negation': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-compare-neg-zero': 'error',
      'no-irregular-whitespace': 'error',
    },
  },
];
