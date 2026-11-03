import { createConfig } from '@rn-tempo/eslint-config';

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
      'assets-catalog',
    ],
  },
  ...createConfig({ root: import.meta.dirname, structure: true }),
];
