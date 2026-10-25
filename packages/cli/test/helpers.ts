import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATE_DIR = path.resolve(here, '../../../template');
export const FIXTURES_DIR = path.join(here, 'fixtures');

/** Creates a temp dir; call the returned `cleanup` in `afterEach`. */
export async function makeTempDir(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Paths never copied from the template: dependencies, native build output and session history. */
const SKIP_SEGMENTS = new Set(['node_modules', 'Pods', 'build', '.gradle', 'DerivedData', '.cxx', '.kotlin']);

/** Copies the real `template/` into `dest` without installed dependencies or build output. */
export async function copyTemplate(dest: string): Promise<void> {
  await cp(TEMPLATE_DIR, dest, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(TEMPLATE_DIR, source);
      return !rel.split(path.sep).some((segment) => SKIP_SEGMENTS.has(segment)) && !rel.startsWith(path.join('.ai', 'sessions')) && rel !== '.ai/.current.json';
    },
  });
}

/** Copies the small fixture project (+ the template's real feature manifests) into `dest`. */
export async function copyFixtureProject(dest: string): Promise<void> {
  await cp(path.join(FIXTURES_DIR, 'project'), dest, { recursive: true });
  await cp(path.join(TEMPLATE_DIR, '.tempo'), path.join(dest, '.tempo'), { recursive: true });
}
