import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKSPACE_VERSIONS } from '../src/generated/versions.ts';
import { defaultTemplateSource, fetchTemplate, isRemoteSource } from '../src/lib/fetch-template.ts';
import { pathExists } from '../src/lib/fs-utils.ts';
import { rewriteWorkspaceLinks } from '../src/lib/workspace-links.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('embedded workspace versions', () => {
  it('match the packages/*/package.json files (run `yarn generate` after a version bump)', () => {
    for (const [name, version] of Object.entries(WORKSPACE_VERSIONS)) {
      const dir = name.replace('@rn-tempo/', '');
      const pkg = JSON.parse(readFileSync(path.join(packagesDir, dir, 'package.json'), 'utf8')) as { version: string };
      expect(pkg.version).toBe(version);
    }
  });
});

describe('rewriteWorkspaceLinks', () => {
  let dir = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-links'));
  });
  afterEach(async () => cleanup());

  it('replaces link: specs with exact versions and leaves other deps alone', async () => {
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@rn-tempo/tsconfig': 'link:../packages/tsconfig', zod: '4.6.7' } }),
    );
    expect(await rewriteWorkspaceLinks(dir, { '@rn-tempo/tsconfig': '1.2.3' })).toEqual(['@rn-tempo/tsconfig']);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies).toEqual({ '@rn-tempo/tsconfig': '1.2.3', zod: '4.6.7' });
  });

  it('fails for a linked package with no embedded version', async () => {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { '@rn-tempo/other': 'portal:../x' } }));
    await expect(rewriteWorkspaceLinks(dir, {})).rejects.toThrow(/No published version/);
  });
});

describe('fetchTemplate', () => {
  let dir = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-fetch'));
  });
  afterEach(async () => cleanup());

  it('classifies sources and builds the release tag', () => {
    expect(isRemoteSource('gh:owner/repo/template#v1.0.0')).toBe(true);
    expect(isRemoteSource('../../template')).toBe(false);
    expect(isRemoteSource('/abs/template')).toBe(false);
    expect(defaultTemplateSource('1.2.3')).toBe('gh:Abdelrahman-Yasser-1/rn-tempo/template#v1.2.3');
  });

  it('copies a local template without node_modules or the AI session pointer', async () => {
    const dest = path.join(dir, 'app');
    const result = await fetchTemplate({ template: TEMPLATE_DIR, cliVersion: '0.0.0', dest, cwd: dir });
    expect(result.local).toBe(true);
    expect(await pathExists(path.join(dest, 'package.json'))).toBe(true);
    expect(await pathExists(path.join(dest, 'node_modules'))).toBe(false);
    expect(await pathExists(path.join(dest, '.ai/.current.json'))).toBe(false);
  });

  it('rejects a local folder that is not a template', async () => {
    await expect(fetchTemplate({ template: dir, cliVersion: '0.0.0', dest: path.join(dir, 'x'), cwd: dir })).rejects.toThrow(/not found/);
  });
});
