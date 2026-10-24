import { projectStructureParser, projectStructurePlugin } from 'eslint-plugin-project-structure';

const KEBAB = '{kebab-case}';
const NON_CODE = ['**/*.{ts,tsx,js,jsx,mjs,cjs}'];

const file = (name, enforceExistence) => ({
  name,
  ...(enforceExistence ? { enforceExistence } : {}),
});
const folder = (name, children) => ({
  name,
  children: [file('.gitkeep'), ...children],
});

const camelFiles = [file('{camelCase}.ts'), file('{camelCase}.test.ts'), file('{camelCase}.d.ts')];

/** `<X>Screen/` folders: screen, its test and a barrel are mandatory (contract C5). */
const screenFolders = folder('{PascalCase}Screen', [
  file('{FolderName}.tsx', ['{NodeName}.test.tsx', 'index.ts']),
  file('{FolderName}.test.tsx'),
  file('styles.ts'),
  file('index.ts'),
]);

const serviceFiles = [file('{PascalCase}.tsx'), file('{PascalCase}.test.tsx'), ...camelFiles];

const featureChildren = [
  folder('api', [file('{camelCase}(.api)?.ts'), file('{camelCase}(.api)?.test.ts')]),
  folder('components', [
    folder('{PascalCase}', [
      file('{FolderName}.tsx', ['index.ts']),
      file('{FolderName}.test.tsx'),
      file('index.ts'),
      file('styles.ts'),
      file('types.ts'),
    ]),
  ]),
  folder('hooks', [file('use{PascalCase}.ts'), file('use{PascalCase}.test.ts')]),
  folder('screens', [screenFolders]),
  folder('store', [file('{camelCase}.store.ts'), file('{camelCase}.store.test.ts')]),
  folder('types', [file('index.ts')]),
  folder('utils', [file('{camelCase}.ts'), file('{camelCase}.test.ts')]),
  file('constants.ts'),
  file('index.ts'),
];

const sharedComponent = folder('{PascalCase}', [
  file('{FolderName}.tsx', ['{NodeName}.test.tsx', '{NodeName}.stories.tsx', 'index.ts']),
  file('{FolderName}.test.tsx'),
  file('{FolderName}.stories.tsx'),
  file('styles.ts'),
  file('types.ts'),
  file('index.ts'),
]);

/** Free-form tree for generated or asset content: any file, any nested folder. */
const FREE_TREE = { children: [{ name: '*' }, { name: '*', ruleId: 'free_tree' }] };

/** The folder skeleton of contract C5, rooted at `src/`. */
export const FOLDER_STRUCTURE = {
  structureRoot: 'src',
  structure: [
    file('{camelCase}.d.ts'),
    folder('app', [
      file('{PascalCase}.tsx'),
      file('{PascalCase}.test.tsx'),
      folder('providers', [file('{PascalCase}.tsx'), file('{PascalCase}.test.tsx'), ...camelFiles]),
      folder('bootstrap', camelFiles),
      folder('screens', [screenFolders]),
    ]),
    folder('navigation', [file('{PascalCase}.tsx'), file('{PascalCase}.test.tsx'), ...camelFiles]),
    folder('features', [folder(KEBAB, featureChildren)]),
    folder('shared', [
      folder('components', [file('index.ts'), sharedComponent]),
      folder('hooks', [
        file('index.ts'),
        file('use{PascalCase}.ts'),
        file('use{PascalCase}.test.ts'),
      ]),
      folder('utils', [file('index.ts'), ...camelFiles]),
      folder('constants', camelFiles),
      folder('types', camelFiles),
    ]),
    // One nested level is allowed (e.g. services/security/pinning); two levels deep is an error.
    folder('services', [folder(KEBAB, [...serviceFiles, folder(KEBAB, serviceFiles)])]),
    folder('theme', camelFiles),
    folder('assets', [
      folder('(fonts|images|icons|animations)', [file('*'), { name: '*', ruleId: 'free_tree' }]),
    ]),
    folder('locales', [folder('[a-z][a-z](-[A-Z][A-Z])?', [file(`${KEBAB}.json`)])]),
    folder('config', camelFiles),
    folder('test-utils', [
      file('{camelCase}.ts'),
      file('{camelCase}.tsx'),
      file('{PascalCase}.tsx'),
      file('{camelCase}.test.ts'),
      { name: '{camelCase}', ruleId: 'test_utils_folder' },
    ]),
  ],
  rules: {
    free_tree: FREE_TREE,
    test_utils_folder: {
      children: [
        file('.gitkeep'),
        file('{camelCase}.ts'),
        file('{camelCase}.test.ts'),
        { name: '{camelCase}', ruleId: 'test_utils_folder' },
      ],
    },
  },
};

/**
 * Folder structure rules (contract C5): unknown folders or files under `src/` are errors, and
 * components and screens must ship their tests, stories and barrel.
 * @param {string} root Absolute path of the project (the folder holding tsconfig.json).
 */
export function structureConfig(root) {
  return [
    {
      name: 'rn-tempo/structure',
      files: ['src/**'],
      plugins: { 'project-structure': projectStructurePlugin },
      rules: {
        'project-structure/folder-structure': ['error', { ...FOLDER_STRUCTURE, projectRoot: root }],
      },
    },
    {
      // Lets the rule see files ESLint cannot parse (json, images, fonts).
      name: 'rn-tempo/structure/parser',
      files: ['src/**'],
      ignores: NON_CODE,
      languageOptions: { parser: projectStructureParser },
    },
  ];
}
