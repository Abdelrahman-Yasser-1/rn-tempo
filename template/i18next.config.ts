import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['en', 'ar'],
  extract: {
    // `keyFromSelector($ => $.a.b, { ns })` builds keys that are stored as data; read it like `t()`.
    functions: ['t', '*.t', 'keyFromSelector'],
    input: ['src/**/*.{ts,tsx}'],
    ignore: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.tsx'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    primaryLanguage: 'en',
    secondaryLanguages: ['ar'],
    // Stale keys and conflicting defaults fail `extract --ci`; keys sort alphabetically.
    removeUnusedKeys: true,
    warnOnConflicts: 'error',
    sort: true,
    // A `context` computed at runtime (`greeting_male`, `greeting_female`) cannot be resolved
    // statically; keep the variants of every key that is called with a `context`.
    preserveContextVariants: true,
  },
  lint: {
    // `lint` has no failOnWarnings switch, so every check that defaults to a warning is an error.
    checkConcatenation: 'error',
    checkPunctuationConcatenation: 'error',
    checkTranslationPlaceholders: 'error',
  },
});
