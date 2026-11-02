import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CliError } from './errors.ts';
import { WORKSPACE_VERSIONS } from '../generated/versions.ts';

const SECTIONS = ['dependencies', 'devDependencies'] as const;

/**
 * Rewrites `link:`/`portal:` specs of `@rn-tempo/*` packages in package.json to exact versions
 * (the template pins exactly). Returns the rewritten package names.
 */
export async function rewriteWorkspaceLinks(
  root: string,
  versions: Readonly<Record<string, string>> = WORKSPACE_VERSIONS,
): Promise<string[]> {
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8')) as Record<string, Record<string, string> | undefined>;
  const rewritten: string[] = [];
  for (const section of SECTIONS) {
    const block = pkg[section];
    if (!block) continue;
    for (const [name, spec] of Object.entries(block)) {
      if (!/^(link|portal):/.test(spec)) continue;
      const version = versions[name];
      if (version === undefined) {
        throw new CliError(`No published version is embedded for ${name} (${spec})`, { code: 'UNKNOWN_WORKSPACE_PACKAGE' });
      }
      block[name] = version;
      rewritten.push(name);
    }
  }
  if (rewritten.length > 0) await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return rewritten;
}

/** Name of this CLI on npm; generated projects depend on it so `yarn tempo` works. */
export const CLI_PACKAGE = 'create-tempo-app';

/**
 * Adds the CLI as an exact-pinned devDependency (no range) so `yarn tempo ...` resolves the same
 * version that generated the project. Returns false when it was already pinned to that version.
 */
export async function addCliDevDependency(root: string, version: string): Promise<boolean> {
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8')) as Record<string, Record<string, string> | undefined>;
  const dev = pkg.devDependencies ?? {};
  if (dev[CLI_PACKAGE] === version) return false;
  dev[CLI_PACKAGE] = version;
  pkg.devDependencies = dev;
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}
