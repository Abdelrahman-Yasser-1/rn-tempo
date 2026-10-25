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
