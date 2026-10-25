import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { downloadTemplate } from 'giget';

import { CliError } from './errors.ts';
import { IGNORED_DIRS, pathExists } from './fs-utils.ts';

export const TEMPLATE_REPO = 'gh:Abdelrahman-Yasser-1/rn-tempo/template';

/** Remote template source for a released CLI version (`#v<version>` tag). */
export function defaultTemplateSource(version: string): string {
  return `${TEMPLATE_REPO}#v${version}`;
}

/** True for giget-style remote sources (`gh:`, `github:`, `gitlab:`, `https:` ...). */
export function isRemoteSource(source: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(source) && !path.isAbsolute(source);
}

export type FetchOptions = {
  /** `--template`: a local folder or any giget source. Defaults to the released tag. */
  template?: string;
  cliVersion: string;
  /** Destination folder (must not exist or be empty). */
  dest: string;
  cwd: string;
};

/** Copies a local template, skipping dependency and build folders and local AI state. */
export async function copyLocalTemplate(source: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  await cp(source, dest, {
    recursive: true,
    filter: (item) => {
      const rel = path.relative(source, item);
      if (rel === '') return true;
      const segments = rel.split(path.sep);
      return !segments.some((segment) => IGNORED_DIRS.has(segment)) && rel !== path.join('.ai', '.current.json');
    },
  });
}

/**
 * Puts the template into `dest`. Local paths are copied (no network); `gh:` and other giget sources
 * are downloaded. Node modules, Pods and build output are never copied.
 */
export async function fetchTemplate(options: FetchOptions): Promise<{ source: string; local: boolean }> {
  const source = options.template ?? defaultTemplateSource(options.cliVersion);
  if (!isRemoteSource(source)) {
    const resolved = path.resolve(options.cwd, source);
    if (!(await pathExists(path.join(resolved, 'package.json')))) {
      throw new CliError(`Template folder not found or invalid: ${resolved}`, { code: 'TEMPLATE_NOT_FOUND' });
    }
    await copyLocalTemplate(resolved, options.dest);
    return { source: resolved, local: true };
  }
  try {
    await downloadTemplate(source, { dir: options.dest, force: true, silent: true });
  } catch (error) {
    await rm(options.dest, { recursive: true, force: true });
    throw new CliError(`Could not download the template from ${source}: ${error instanceof Error ? error.message : String(error)}`, {
      code: 'TEMPLATE_DOWNLOAD_FAILED',
    });
  }
  return { source, local: false };
}
