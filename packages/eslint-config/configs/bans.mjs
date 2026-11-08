import { TEST_FILES } from './tests.mjs';

const STORY_FILES = ['**/*.stories.tsx'];
const SOURCE = ['src/**', '.rnstorybook/**'];
const PARENT = String.raw`/^\.\.(\/|$)/`;
const ENV_NAMES = '/^(dev|staging|prod)$/';
const RN_IMPORT = "ImportDeclaration[source.value='react-native'] ImportSpecifier";

/** Calls whose first argument is a module specifier (`require`, `jest.mock`, ...). */
const MODULE_CALL = (specifier) =>
  [
    `CallExpression[callee.name='require'][arguments.0.value=${specifier}]`,
    `CallExpression[callee.object.name='jest'][callee.property.name=/^(mock|requireActual|requireMock|doMock|unmock)$/][arguments.0.value=${specifier}]`,
  ].join(', ');

/** Cheap bans (spec item 5): each is one selector with its own scope. */
export const CHEAP_BAN_ENTRIES = [
  {
    selector: [
      `ImportDeclaration[source.value=${PARENT}]`,
      `ExportNamedDeclaration[source.value=${PARENT}]`,
      `ExportAllDeclaration[source.value=${PARENT}]`,
      `ImportExpression[source.value=${PARENT}]`,
      MODULE_CALL(PARENT),
    ].join(', '),
    message:
      "Import through a path alias, not '../': @shared/..., @features/<name>/..., @services/... (see tsconfig paths). './' stays for the same folder.",
    files: SOURCE,
  },
  {
    selector: 'ExportAllDeclaration',
    message:
      "Name the exports: `export { A, B } from './x'` and `export type { T } from './x'`. `export *` hides what a barrel exposes.",
    files: SOURCE,
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'Read configuration through @config/env, not process.env.',
    files: ['src/**'],
    ignores: ['src/config/**'],
  },
  {
    selector: [
      `BinaryExpression[operator=/^[!=]==?$/] > Literal[value=${ENV_NAMES}]`,
      `SwitchCase > Literal.test[value=${ENV_NAMES}]`,
    ].join(', '),
    message:
      'Do not branch on the environment name. Use isDev, isStaging or isProd from @config/env.',
    files: ['src/**'],
    ignores: ['src/config/**'],
  },
  {
    selector: [
      'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
      'Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/i]',
      'TemplateElement[value.cooked=/^(?:rgb|rgba|hsl|hsla)\\(/i]',
    ].join(', '),
    message: 'No color literals outside src/theme. Use a theme token (theme.colors.*).',
    files: ['src/**'],
    ignores: ['src/theme/**', ...TEST_FILES, ...STORY_FILES],
  },
  {
    selector: `${RN_IMPORT}[imported.name='Appearance']`,
    message:
      'Appearance belongs to src/theme and src/app. Read the color scheme from the Unistyles theme (useUnistyles).',
    files: ['src/**'],
    ignores: ['src/theme/**', 'src/app/**', ...TEST_FILES, ...STORY_FILES],
  },
  {
    selector: `${RN_IMPORT}[imported.name='StatusBar']`,
    message:
      'StatusBar belongs to src/app and <Screen /> (@shared/components), which set its style from the theme.',
    files: ['src/**'],
    ignores: [
      'src/theme/**',
      'src/app/**',
      // Screen owns the status-bar style of every screen.
      'src/shared/components/Screen/**',
      ...TEST_FILES,
      ...STORY_FILES,
    ],
  },
];
