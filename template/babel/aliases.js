// Path aliases from one source: `compilerOptions.paths` in tsconfig.json (contract C4). Babel, Jest
// and ESLint derive their alias lists from it, so adding an alias means editing tsconfig.json only.
const path = require('node:path');

const ts = require('typescript');

const ROOT = path.join(__dirname, '..');

/** Reads `compilerOptions.paths` (tsconfig allows comments, so it goes through the TS parser). */
function tsconfigPaths() {
  const file = path.join(ROOT, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
  if (error) {
    throw new Error(
      `Cannot read ${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  }
  const paths = config.compilerOptions?.paths ?? {};
  return Object.entries(paths).map(([alias, [target]]) => ({
    name: alias.replace(/\/\*$/, ''),
    dir: target.replace(/\/\*$/, ''),
  }));
}

/** `{ '@app': './src/app', ... }` for babel-plugin-module-resolver. */
function babelAliases() {
  return Object.fromEntries(tsconfigPaths().map(({ name, dir }) => [name, dir]));
}

/** `{ '^@app/(.*)$': '<rootDir>/src/app/$1', ... }` for Jest's moduleNameMapper. */
function jestModuleNameMapper() {
  return Object.fromEntries(
    tsconfigPaths().map(({ name, dir }) => [
      `^${name}/(.*)$`,
      `<rootDir>/${dir.replace(/^\.\//, '')}/$1`,
    ]),
  );
}

module.exports = { babelAliases, jestModuleNameMapper, tsconfigPaths };
