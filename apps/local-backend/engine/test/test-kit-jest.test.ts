import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runFixture, stageKit } from '../scripts/run-kit-fixture.ts';
import { startSite, stopTeams } from './team-helpers.ts';

/**
 * AC-LP-3 end to end: a plain Node + axios + Jest project (test/fixtures/jest-project, no React Native, no mock files) runs
 * its suite against the kit as a consumer gets it (the built CommonJS file, through the published `exports` map), with a
 * local backend folder and with a URL served by a team server.
 */
const FIXTURE_BACKEND = join(import.meta.dirname, 'fixtures', 'jest-project', 'backend');
const STAGE = join(import.meta.dirname, '..', '.kit-stage');
const JEST_TIMEOUT = 120_000;
let modules = '';
const temp: string[] = [];

beforeAll(() => {
  modules = stageKit(STAGE);
}, JEST_TIMEOUT);

afterAll(async () => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
  rmSync(STAGE, { recursive: true, force: true });
  await stopTeams();
});

const tmp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temp.push(dir);
  return dir;
};

function trim(output: string): string {
  return output
    .split('\n')
    .filter((line) => /^(PASS|FAIL|Tests:|Test Suites:|Time:)|●|\[tempo-backend\]/.test(line))
    .join('\n');
}

describe('the Jest fixture project', () => {
  it('resolves @rn-tempo/local-backend/test through the published exports map (require and import)', () => {
    const from = join(STAGE, 'node_modules', 'consumer.js');
    expect(createRequire(from).resolve('@rn-tempo/local-backend/test')).toBe(join(STAGE, 'node_modules', '@rn-tempo', 'local-backend', 'dist', 'test.cjs'));
    expect(import.meta.resolve('@rn-tempo/local-backend/test', `file://${from}`)).toBeTypeOf('string');
    const kit = createRequire(from)('@rn-tempo/local-backend/test') as { setupTempoBackend: unknown };
    expect(typeof kit.setupTempoBackend).toBe('function');
  });

  it('AC-LP-3 passes against a committed backend folder, in parallel workers, one engine per file', async () => {
    const timing = join(tmp('kit-timing-'), 'start.txt');
    const result = await runFixture(modules, { TEMPO_BACKEND: FIXTURE_BACKEND, EXPECT_LOADED: 'folder', TEMPO_TIMING_FILE: timing }, ['--maxWorkers=3']);
    process.stdout.write(`${trim(result.output)}\n`);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toMatch(/Tests:\s+\d+ passed, \d+ total/);
    const starts = readFileSync(timing, 'utf8').trim().split('\n').map(Number);
    process.stdout.write(`engine start per Jest file (folder source, 100 rows): ${starts.join(', ')} ms\n`);
    expect(starts).toHaveLength(1);
  }, JEST_TIMEOUT);

  it('AC-LP-3 passes with a fresh state for every test (isolate: test), and files one after the other', async () => {
    const result = await runFixture(modules, { TEMPO_BACKEND: FIXTURE_BACKEND, TEMPO_ISOLATE: 'test' }, ['--runInBand']);
    expect(result.code, result.output).toBe(0);
  }, JEST_TIMEOUT);

  it('AC-LP-3 passes against a URL served by a team server, then offline from the cache', async () => {
    const site = await startSite({ backend: false });
    const folder = join(site.dir, 'backends', 'jest-fixture');
    cpSync(FIXTURE_BACKEND, folder, { recursive: true });
    expect((await site.owner.hub('POST', '/backends/open', { name: 'jest-fixture' })).status).toBe(200);
    expect((await site.owner.hub('POST', '/backends/jest-fixture/start', {})).status).toBe(200);
    const made = await site.owner.hub('POST', '/backends/jest-fixture/api-keys', { name: 'ci', scope: 'read-definition' });
    const key = (made.json() as { key: string }).key;
    const env = { TEMPO_BACKEND: `http://127.0.0.1:${String(site.team.port)}/b/jest-fixture`, TEMPO_BACKEND_KEY: key, TEMPO_CACHE_DIR: tmp('kit-jest-cache-') };

    const online = await runFixture(modules, { ...env, EXPECT_LOADED: 'download' });
    process.stdout.write(`${trim(online.output)}\n`);
    expect(online.code, online.output).toBe(0);
    const again = await runFixture(modules, { ...env, EXPECT_LOADED: 'not-modified' });
    expect(again.code, again.output).toBe(0);

    await site.team.stop();
    const offline = await runFixture(modules, { ...env, EXPECT_LOADED: 'cache' });
    process.stdout.write(`offline: ${trim(offline.output)}\n`);
    expect(offline.code, offline.output).toBe(0);
    expect(offline.output).toMatch(/not reachable.*cached copy/s);
    expect(offline.output).not.toContain(key);
  }, JEST_TIMEOUT * 2);
});
