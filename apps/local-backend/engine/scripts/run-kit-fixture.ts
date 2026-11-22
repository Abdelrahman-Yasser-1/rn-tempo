// Builds the test kit, stages it the way a consumer's node_modules holds it, and runs the fixture Jest project against it.
// Usage: node scripts/run-kit-fixture.ts [-- jest args]. Environment: TEMPO_BACKEND, TEMPO_BACKEND_KEY, TEMPO_CACHE_DIR.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Builds the kit and copies it, with the published `exports` map, to `<stage>/node_modules/@rn-tempo/local-backend`. */
export function stageKit(stage: string): string {
  execFileSync(process.execPath, [require.resolve('tsdown/run'), '--no-clean'], { cwd: engine, stdio: 'pipe' });
  const pkg = JSON.parse(readFileSync(join(engine, 'package.json'), 'utf8')) as { name: string; version: string; publishConfig: { exports: unknown } };
  const modules = join(stage, 'node_modules');
  const target = join(modules, '@rn-tempo', 'local-backend');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(target, 'dist'), { recursive: true });
  for (const file of ['test.cjs', 'test.mjs', 'test.d.cts', 'test.d.mts']) cpSync(join(engine, 'dist', file), join(target, 'dist', file));
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', exports: pkg.publishConfig.exports }, null, 2));
  return modules;
}

export interface JestRun {
  code: number;
  output: string;
}

/** Runs the fixture project's Jest with the given environment. */
export function runFixture(modules: string, env: Record<string, string | undefined>, args: string[] = []): Promise<JestRun> {
  const jest = require.resolve('jest/bin/jest');
  const project = join(engine, 'test', 'fixtures', 'jest-project');
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [jest, '--config', join(project, 'jest.config.cjs'), ...args], {
      cwd: project,
      env: { ...process.env, ...env, TEMPO_KIT_NODE_MODULES: modules, NODE_OPTIONS: '' },
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.once('error', fail);
    child.once('close', (code) => done({ code: code ?? 1, output }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modules = stageKit(join(engine, '.kit-stage'));
  const extra = process.argv.slice(2).filter((arg) => arg !== '--');
  const source = process.env.TEMPO_BACKEND ?? join(engine, 'test', 'fixtures', 'jest-project', 'backend');
  const result = await runFixture(modules, { TEMPO_BACKEND: source }, extra);
  process.stdout.write(result.output);
  process.exit(result.code);
}
