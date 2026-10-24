import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['en', 'ar'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    ignore: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.tsx'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    primaryLanguage: 'en',
    secondaryLanguages: ['ar'],
  },
  lint: {
    // `lint` has no failOnWarnings switch, so every check that defaults to a warning is an error.
    checkConcatenation: 'error',
    checkPunctuationConcatenation: 'error',
    checkTranslationPlaceholders: 'error',
  },
});
