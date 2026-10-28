// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // HTML-entity escaping is a web concern; native <Text> renders apostrophes as-is.
    rules: { 'react/no-unescaped-entities': 'off' },
  },
  {
    // Copied from poc-frontend: a zod schema and its inferred type share a name on purpose.
    files: ['src/schemas/**'],
    rules: { '@typescript-eslint/no-redeclare': 'off' },
  },
]);
