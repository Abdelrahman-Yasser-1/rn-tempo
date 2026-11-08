import { createConfig } from '@rn-tempo/eslint-config';

/**
 * Dependency ownership of this project, merged over the template's DEPENDENCY_POLICY. Every runtime
 * dependency in package.json needs an entry (`yarn lint:deps` fails otherwise):
 *   'some-sdk': { kind: 'owned', owners: ['src/services/some/**'], message: 'Use @services/some.' }
 *   'some-lib': { kind: 'free', reason: 'Used across the app.' }
 *   'some-native': { kind: 'native', reason: 'Linked natively; no JS import.' }
 */
export const dependencies = {};

export default [
  {
    ignores: [
      '**/node_modules',
      'android',
      'ios',
      'vendor',
      'coverage',
      '.rnstorybook/storybook.requires.ts',
      'e2e',
      'scripts/ai-log',
      // svgr output: default exports and JSX attribute strings, which our rules forbid.
      'src/assets/generated',
    ],
  },
  ...createConfig({ root: import.meta.dirname, structure: true, dependencies }),
];
