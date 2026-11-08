import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { babelAliases, jestModuleNameMapper } = require(join(root, 'babel', 'aliases.js'));

/** `compilerOptions.paths` of tsconfig.json (comments allowed), as `[alias, folder]` pairs. */
function tsconfigPaths() {
  const text = readFileSync(join(root, 'tsconfig.json'), 'utf8');
  const { config } = ts.parseConfigFileTextToJson('tsconfig.json', text);
  return Object.entries(config.compilerOptions.paths).map(([alias, [target]]) => [
    alias.replace('/*', ''),
    target.replace('/*', '').replace(/^\.\//, ''),
  ]);
}

describe('path aliases', () => {
  const paths = tsconfigPaths();

  it('reads at least the contract C4 aliases from tsconfig.json', () => {
    assert.ok(paths.length >= 10);
  });

  it('gives Babel every tsconfig path', () => {
    const aliases = babelAliases();
    assert.deepEqual(Object.keys(aliases).sort(), paths.map(([name]) => name).sort());
    for (const [name, folder] of paths) {
      assert.equal(aliases[name], `./${folder}`);
    }
  });

  it('gives Jest every tsconfig path', () => {
    const mapper = jestModuleNameMapper();
    assert.equal(Object.keys(mapper).length, paths.length);
    for (const [name, folder] of paths) {
      assert.equal(mapper[`^${name}/(.*)$`], `<rootDir>/${folder}/$1`);
    }
  });
});
