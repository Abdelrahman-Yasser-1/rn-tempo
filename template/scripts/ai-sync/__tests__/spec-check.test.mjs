import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkSpecs, jestAcIds, maestroAcIds, parseSpec } from '../../spec-check.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../spec-check.mjs');

function write(cwd, relative, content) {
  const target = path.join(cwd, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const spec = (status) =>
  `---\nstatus: ${status}\n---\n\n## Acceptance criteria\n\n- **AC-1** Given a, when b, then c.\n- **AC-2** Given a, when b, then d.\n- ~~**AC-3** removed~~\n`;

describe('spec-check parsing', () => {
  it('reads status and skips struck-through ACs', () => {
    assert.deepEqual(parseSpec(spec('approved')), {
      status: 'approved',
      criteria: ['AC-1', 'AC-2'],
    });
  });

  it('finds AC ids in Jest titles', () => {
    const text =
      "it('AC-1: a', () => {});\ntest.only(`AC-2: b`, () => {});\nit('plain AC-9', () => {});";
    assert.deepEqual(jestAcIds(text), ['AC-1', 'AC-2']);
  });

  it('finds AC ids in Maestro tags', () => {
    const flow = 'appId: x\ntags:\n  - AC-1\n  - smoke\n  - AC-2\n---\n- launchApp\n';
    assert.deepEqual(maestroAcIds(flow), ['AC-1', 'AC-2']);
    assert.deepEqual(maestroAcIds('tags: [AC-4, smoke]\n---\n'), ['AC-4']);
    assert.deepEqual(maestroAcIds('---\n- tapOn: AC-7\n'), []);
  });
});

describe('spec-check coverage', () => {
  let cwd;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'spec-check-'));
    write(cwd, 'specs/_templates/spec.md', spec('draft'));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('ignores _templates and reports uncovered ACs', () => {
    write(cwd, 'specs/auth/spec.md', spec('implemented'));
    write(cwd, 'src/features/auth/hooks/useLogin.test.ts', "it('AC-1: logs in', () => {});\n");
    assert.deepEqual(checkSpecs({ cwd }), [
      { feature: 'auth', status: 'implemented', total: 2, uncovered: ['AC-2'], enforced: true },
    ]);
  });

  it('does not count tests of another feature', () => {
    write(cwd, 'specs/auth/spec.md', spec('implemented'));
    write(cwd, 'src/features/auth/a.test.ts', "it('AC-1: x', () => {});\n");
    write(cwd, 'src/features/items/b.test.ts', "it('AC-2: y', () => {});\n");
    assert.deepEqual(checkSpecs({ cwd })[0].uncovered, ['AC-2']);
  });

  it('counts Maestro flows prefixed with the feature name', () => {
    write(cwd, 'specs/auth/spec.md', spec('verified'));
    write(cwd, 'src/features/auth/a.test.ts', "it('AC-1: x', () => {});\n");
    write(cwd, 'e2e/flows/auth-login.yaml', 'appId: x\ntags:\n  - AC-2\n---\n- launchApp\n');
    assert.deepEqual(checkSpecs({ cwd })[0].uncovered, []);
  });

  it('only enforces implemented and verified specs unless strict', () => {
    write(cwd, 'specs/auth/spec.md', spec('approved'));
    assert.equal(checkSpecs({ cwd })[0].enforced, false);
    assert.equal(checkSpecs({ cwd, strict: true })[0].enforced, true);
  });

  it('exits 1 for an uncovered implemented spec and 0 otherwise', () => {
    write(cwd, 'specs/auth/spec.md', spec('implemented'));
    assert.equal(
      spawnSync(process.execPath, [script, '--cwd', cwd], { encoding: 'utf8' }).status,
      1,
    );
    write(cwd, 'specs/auth/spec.md', spec('draft'));
    const result = spawnSync(process.execPath, [script, '--cwd', cwd], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /todo auth \[draft\] 0\/2/);
  });
});
