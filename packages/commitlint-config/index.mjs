export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

/** Scopes shared by every RN-TEMPO project. Projects add their own feature names via `createConfig`. */
export const SCOPES = [
  // repo
  'repo', 'template', 'packages', 'cli', 'contracts', 'eslint-config', 'prettier-config', 'commitlint-config', 'tsconfig',
  'docs', 'docs-content', 'specs', 'ai', 'ci', 'release', 'deps',
  // app infrastructure
  'native', 'android', 'ios', 'env', 'app', 'navigation', 'theme', 'i18n', 'http', 'storage', 'security', 'flags',
  'remote-config', 'logger', 'network', 'toast',
  // shared code
  'ui', 'hooks', 'utils',
  // features
  'auth', 'home', 'profile', 'settings', 'items', 'onboarding', 'forms',
  // tooling
  'e2e', 'test', 'storybook', 'fastlane', 'vscode',
];

/** Builds the config; `extraScopes` lets a project register its own feature scopes. */
export function createConfig({ extraScopes = [] } = {}) {
  return {
    extends: ['@commitlint/config-conventional'],
    rules: {
      'type-enum': [2, 'always', TYPES],
      'scope-enum': [2, 'always', [...SCOPES, ...extraScopes]],
      'scope-empty': [2, 'never'],
      'header-max-length': [2, 'always', 100],
    },
  };
}

export default createConfig();
