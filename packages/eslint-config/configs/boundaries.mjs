import path from 'node:path';

import boundaries from 'eslint-plugin-boundaries';

export const SOURCE_FILES = ['src/**/*.{ts,tsx}'];
export const TEST_UTILS_CONSUMERS = [
  'src/**/*.test.{ts,tsx}',
  'src/**/*.stories.tsx',
  'src/test-utils/**',
];

/** Element types of the architecture (PLAN task 1.5). Folder mode: each pattern is a folder. */
const ELEMENTS = [
  { type: 'app', pattern: 'src/app' },
  { type: 'navigation', pattern: 'src/navigation' },
  { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
  { type: 'shared-ui', pattern: 'src/shared/{components,hooks}' },
  { type: 'shared-core', pattern: 'src/shared/{utils,types,constants}' },
  { type: 'services', pattern: 'src/services' },
  { type: 'theme', pattern: 'src/theme' },
  { type: 'assets', pattern: 'src/assets' },
  { type: 'locales', pattern: 'src/locales' },
  { type: 'config', pattern: 'src/config' },
  { type: 'test-utils', pattern: 'src/test-utils' },
];

const ALL_TYPES = ELEMENTS.map((element) => element.type);

const types = (...names) => ({ element: { type: names } });
const featureIndexOnly = { element: { type: 'feature', fileInternalPath: 'index.ts' } };
const sameFeature = {
  element: { type: 'feature', captured: { feature: '{{from.element.captured.feature}}' } },
};
const navigationContract = {
  element: { type: 'navigation', fileInternalPath: '{types,navigationRef}.ts' },
};

/**
 * Shown when an edge is disallowed and no policy below names it. The `{{...}}` placeholders are
 * Handlebars, filled in by eslint-plugin-boundaries.
 */
const DEFAULT_MESSAGE =
  "'{{from.type}}' must not import '{{to.type}}' ({{dependency.source}}). Check the dependency matrix in AGENTS.md (Imports follow the boundary matrix) and move the code or pass it in as a prop.";

/**
 * The allowed-dependency matrix. Anything not listed is an error (`default: 'disallow'`).
 * The last matching policy wins, so the disallow policies with guidance come first and the allow
 * policies after them re-allow the legal edges.
 */
const POLICIES = [
  {
    // Re-allowed below for the same feature and for `index.ts`.
    disallow: { to: types('feature') },
    message:
      "features/{{to.captured.feature}} may be imported only through its index.ts: import from '@features/{{to.captured.feature}}' and export what is missing from that barrel.",
  },
  {
    from: types('shared-ui', 'shared-core'),
    disallow: { to: types('feature') },
    message:
      'Shared code must not import features. Move the shared part to @shared, or pass the feature value in as a prop.',
  },
  {
    from: types('services'),
    disallow: { to: types('shared-ui', 'feature', 'app', 'navigation', 'theme', 'assets') },
    message: 'Services must not import UI. Return data and let the caller render it.',
  },
  {
    // Re-allowed below for tests, stories and src/test-utils itself.
    disallow: { to: types('test-utils') },
    message:
      'src/test-utils is for tests and stories only. Import it from *.test.ts(x), *.stories.tsx or src/test-utils.',
  },
  {
    from: { element: { type: 'app' } },
    allow: {
      to: [
        types(
          'app',
          'navigation',
          'shared-ui',
          'shared-core',
          'services',
          'theme',
          'assets',
          'config',
          'locales',
        ),
        featureIndexOnly,
      ],
    },
  },
  {
    from: { element: { type: 'navigation' } },
    allow: {
      to: [
        types('navigation', 'shared-ui', 'shared-core', 'services', 'theme', 'config'),
        featureIndexOnly,
      ],
    },
  },
  {
    from: { element: { type: 'feature' } },
    allow: {
      to: [
        sameFeature,
        featureIndexOnly,
        types('shared-ui', 'shared-core', 'services', 'theme', 'assets', 'config'),
        navigationContract,
      ],
    },
  },
  {
    from: { element: { type: 'shared-ui' } },
    allow: {
      to: types('shared-ui', 'shared-core', 'services', 'theme', 'assets', 'config'),
    },
  },
  {
    from: { element: { type: 'shared-core' } },
    allow: { to: types('shared-core', 'config') },
  },
  {
    from: { element: { type: 'services' } },
    allow: { to: types('services', 'shared-core', 'config', 'locales') },
  },
  { from: { element: { type: 'theme' } }, allow: { to: types('theme') } },
  { from: { element: { type: 'assets' } }, allow: { to: types('assets') } },
  { from: { element: { type: 'locales' } }, allow: { to: types('locales') } },
  { from: { element: { type: 'config' } }, allow: { to: types('config') } },
  { from: { element: { type: 'test-utils' } }, allow: { to: types(...ALL_TYPES) } },
];

/**
 * Import boundaries between architecture layers.
 * @param {string} root Absolute path of the project (the folder holding tsconfig.json).
 */
export function boundariesConfig(root) {
  return [
    {
      name: 'rn-tempo/boundaries',
      files: SOURCE_FILES,
      plugins: { boundaries },
      settings: {
        'boundaries/elements': ELEMENTS,
        'boundaries/root-path': root,
        'boundaries/include': ['src/**/*'],
        'import/resolver': {
          typescript: { alwaysTryTypes: true, project: path.join(root, 'tsconfig.json') },
        },
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          { default: 'disallow', message: DEFAULT_MESSAGE, policies: POLICIES },
        ],
      },
    },
    {
      // Tests, stories and test-utils itself are the only consumers of src/test-utils.
      name: 'rn-tempo/boundaries/test-utils',
      files: TEST_UTILS_CONSUMERS,
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            message: DEFAULT_MESSAGE,
            policies: [...POLICIES, { allow: { to: types('test-utils') } }],
          },
        ],
      },
    },
  ];
}
