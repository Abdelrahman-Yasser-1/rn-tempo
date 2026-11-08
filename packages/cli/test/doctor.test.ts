import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { envKeyMismatches, hasErrors, isMoreThanOneMinorBehind, parseEnvKeys, renderMarkdown, runDoctor, structureMessages } from '../src/lib/doctor.ts';
import type { Capturer } from '../src/lib/pm.ts';
import { copyTemplate, makeTempDir } from './helpers.ts';

const fakeCapturer = (overrides: Record<string, { exitCode?: number; stdout?: string; stderr?: string }> = {}): Capturer => async (command, args) => {
  const key = [command, ...args].join(' ');
  const hit = overrides[key] ?? overrides[command];
  if (hit) return { exitCode: hit.exitCode ?? 0, stdout: hit.stdout ?? '', stderr: hit.stderr ?? '' };
  const defaults: Record<string, string> = {
    'yarn --version': '4.18.1',
    'xcodebuild -version': 'Xcode 26.0\nBuild version 1',
    'bundle --version': 'Bundler version 2.6',
    'pod --version': '1.15.2',
    'npm view @rn-tempo/eslint-config version': '0.0.0',
  };
  if (key === 'java -version') return { exitCode: 0, stdout: '', stderr: 'openjdk version "17.0.9" 2023' };
  return { exitCode: 0, stdout: defaults[key] ?? '0.0.0', stderr: '' };
};

describe('version comparison', () => {
  it('warns only when more than one minor behind', () => {
    expect(isMoreThanOneMinorBehind('1.2.0', '1.3.0')).toBe(false);
    expect(isMoreThanOneMinorBehind('1.2.0', '1.4.0')).toBe(true);
    expect(isMoreThanOneMinorBehind('1.9.0', '2.0.0')).toBe(true);
  });
});

describe('structureMessages', () => {
  it('keeps only structure and boundary rules', () => {
    const json = JSON.stringify([
      { filePath: '/p/src/a.ts', messages: [{ ruleId: 'boundaries/dependencies', message: 'bad import' }, { ruleId: 'no-console', message: 'x' }, { ruleId: 'project-structure/folder-structure', message: 'bad name' }] },
    ]);
    expect(structureMessages(json)).toEqual(['a.ts: bad import', 'a.ts: bad name']);
    expect(structureMessages('not json')).toBeNull();
  });
});

describe('env key parity', () => {
  it('parses keys and skips blanks and comments', () => {
    expect([...parseEnvKeys('# c\nA=1\n\n# note\nB=\n')]).toEqual(['A', 'B']);
  });

  it('lists missing and extra keys per file and ignores matching files', () => {
    const files = { '.env.example': 'A=1\nB=2\n', '.env.dev': 'B=9\nA=8\n', '.env.prod': 'A=1\nC=3\n' };
    expect(envKeyMismatches(files)).toEqual({ '.env.prod': { missing: ['B'], extra: ['C'] } });
  });
});

describe('runDoctor', () => {
  let dir = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-doctor'));
    await copyTemplate(dir);
  });
  afterEach(async () => cleanup());

  const run = (capturer = fakeCapturer(), nodeVersion = '24.3.0') =>
    runDoctor(dir, { capturer, platform: 'darwin', env: { ANDROID_HOME: '/sdk' }, nodeVersion, offline: true, skipLint: true });

  it('reports a healthy project and flags a missing .env file as an error', async () => {
    const checks = await run();
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    expect(byId['tempo-json']?.status).toBe('ok');
    expect(byId['node']?.status).toBe('ok');
    expect(byId['java']?.status).toBe('ok');
    expect(byId['env-dev']?.status).toBe('ok');
    expect(byId['env-staging']?.status).toBe('error'); // .env.staging is gitignored in the template
    expect(byId['markers']?.status).toBe('ok');
    expect(hasErrors(checks)).toBe(true);
    await cp(path.join(dir, '.env.example'), path.join(dir, '.env.staging'));
    await cp(path.join(dir, '.env.example'), path.join(dir, '.env.prod'));
    expect(hasErrors(await run())).toBe(false);
  });

  it('checks env files against .env.example and a tracked root .env', async () => {
    expect((await run()).find((c) => c.id === 'env-files')?.status).toBe('ok');
    const tracked = await run(fakeCapturer({ 'git ls-files .env': { stdout: '.env\n' } }));
    expect(tracked.find((c) => c.id === 'env-files')?.status).toBe('warn');
    await writeFile(path.join(dir, '.env.dev'), 'APP_ENV=dev\nEXTRA=1\n');
    const mismatch = (await run()).find((c) => c.id === 'env-files');
    expect(mismatch?.status).toBe('error');
    expect(mismatch?.message).toContain('.env.dev');
    expect(mismatch?.message).toContain('extra EXTRA');
  });

  it('runs align-deps only when it is installed and reports its findings as a warning', async () => {
    expect((await run()).find((c) => c.id === 'align-deps')).toBeUndefined();
    await mkdir(path.join(dir, 'node_modules/.bin'), { recursive: true });
    await writeFile(path.join(dir, 'node_modules/.bin/rnx-align-deps'), '');
    const aligned = (await run()).find((c) => c.id === 'align-deps');
    expect(aligned?.status).toBe('ok');
    const stdout = 'error package.json\n      ├── dependencies["react"]: found "19.3.1", expected "19.3.0"\n      └── Re-run with \'--write\'';
    const mismatch = (await run(fakeCapturer({ 'yarn lint:align-deps': { exitCode: 1, stdout } }))).find((c) => c.id === 'align-deps');
    expect(mismatch?.status).toBe('warn');
    expect(mismatch?.message).toContain('dependencies["react"]: found "19.3.1", expected "19.3.0"');
  });

  it('flags old Java, a wrong Node major and a broken .tempo.json', async () => {
    const checks = await run(fakeCapturer({ 'java -version': { stderr: 'openjdk version "11.0.2"' } }), '22.1.0');
    expect(checks.find((c) => c.id === 'java')?.status).toBe('error');
    expect(checks.find((c) => c.id === 'node')?.status).toBe('error');
    await writeFile(path.join(dir, '.tempo.json'), '{}');
    expect((await run()).find((c) => c.id === 'tempo-json')?.status).toBe('error');
  });

  it('flags unbalanced markers and renders a markdown report', async () => {
    await writeFile(path.join(dir, 'src/broken.ts'), '// @tempo-feature:samples:start\n');
    const checks = await run();
    expect(checks.find((c) => c.id === 'markers')?.message).toContain('src/broken.ts:1');
    const md = renderMarkdown(checks);
    expect(md).toContain('| Status | Check | Details |');
    expect(md).toContain('| ERROR |');
  });

  it('skips Xcode off macOS and warns without an Android SDK', async () => {
    await cp(path.join(dir, '.env.dev'), path.join(dir, '.env.staging'));
    const checks = await runDoctor(dir, { capturer: fakeCapturer(), platform: 'linux', env: {}, offline: true, skipLint: true });
    expect(checks.find((c) => c.id === 'xcode')?.status).toBe('info');
    expect(checks.find((c) => c.id === 'android-sdk')?.status).toBe('warn');
  });
});
