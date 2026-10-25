import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FeatureManifest, FeatureName } from '@rn-tempo/contracts';

import { CliError } from './errors.ts';
import { formatSchemaErrors, validators } from './schema.ts';

export const MANIFEST_DIR = '.tempo/features';

export type ManifestMap = ReadonlyMap<FeatureName, FeatureManifest>;

/** Validates one manifest object (contract C7.4). */
export function parseManifest(data: unknown, source: string): FeatureManifest {
  const { manifest } = validators();
  if (!manifest(data)) {
    throw new CliError(`${source} is not a valid feature manifest`, {
      code: 'MANIFEST_INVALID',
      details: formatSchemaErrors(manifest),
    });
  }
  return data as FeatureManifest;
}

/** Loads every `.tempo/features/*.json` of a project; each must be named after its file. */
export async function loadManifests(projectDir: string): Promise<ManifestMap> {
  const dir = path.join(projectDir, MANIFEST_DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  } catch {
    throw new CliError(`No feature manifests found at ${MANIFEST_DIR}`, { code: 'MANIFESTS_MISSING' });
  }
  const manifests = new Map<FeatureName, FeatureManifest>();
  for (const file of files) {
    const source = `${MANIFEST_DIR}/${file}`;
    let data: unknown;
    try {
      data = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    } catch (error) {
      throw new CliError(`${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
        code: 'MANIFEST_INVALID',
      });
    }
    const manifest = parseManifest(data, source);
    if (`${manifest.name}.json` !== file) {
      throw new CliError(`${source} declares name "${manifest.name}" but is named ${file}`, { code: 'MANIFEST_INVALID' });
    }
    manifests.set(manifest.name, manifest);
  }
  return manifests;
}

function manifestFor(manifests: ManifestMap, name: FeatureName): FeatureManifest {
  const manifest = manifests.get(name);
  if (!manifest) throw new CliError(`Unknown feature "${name}"`, { code: 'UNKNOWN_FEATURE' });
  return manifest;
}

/** Features that are preselected in the create prompt (`defaultEnabled`). */
export function defaultFeatures(manifests: ManifestMap): FeatureName[] {
  return [...manifests.values()].filter((manifest) => manifest.defaultEnabled).map((manifest) => manifest.name);
}

export type Selection = { features: FeatureName[]; added: FeatureName[] };

/**
 * Closes a wanted feature set over `requires` and rejects `conflicts`.
 * `added` lists features that were pulled in only because something requires them.
 */
export function resolveSelection(manifests: ManifestMap, wanted: readonly FeatureName[]): Selection {
  const selected = new Set<FeatureName>(wanted);
  const added: FeatureName[] = [];
  const queue = [...wanted];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const required of manifestFor(manifests, current).requires) {
      if (!selected.has(required)) {
        selected.add(required);
        added.push(required);
        queue.push(required);
      }
    }
  }
  for (const name of selected) {
    for (const conflict of manifestFor(manifests, name).conflicts) {
      if (selected.has(conflict)) {
        throw new CliError(`Features "${name}" and "${conflict}" conflict and cannot both be enabled`, {
          code: 'FEATURE_CONFLICT',
        });
      }
    }
  }
  return { features: [...manifests.keys()].filter((name) => selected.has(name)), added };
}

export type RemovalPlan = {
  /** Features to remove, dependents first (a feature is removed before the ones it requires). */
  remove: FeatureName[];
  keep: FeatureName[];
};

/**
 * Plans removing `toRemove` from the `enabled` features. Throws when a kept feature still requires
 * a feature that would be removed, naming both.
 */
export function planRemoval(manifests: ManifestMap, enabled: readonly FeatureName[], toRemove: readonly FeatureName[]): RemovalPlan {
  const removing = new Set(toRemove.filter((name) => enabled.includes(name)));
  const keep = enabled.filter((name) => !removing.has(name));
  const blocked: string[] = [];
  for (const name of keep) {
    for (const required of manifestFor(manifests, name).requires) {
      if (removing.has(required)) blocked.push(`"${name}" requires "${required}"`);
    }
  }
  if (blocked.length > 0) {
    throw new CliError('Cannot remove a feature that other enabled features require', {
      code: 'FEATURE_REQUIRED',
      details: blocked,
    });
  }
  // Dependents first: a feature goes before everything it requires.
  const ordered: FeatureName[] = [];
  const visit = (name: FeatureName, trail: readonly FeatureName[]) => {
    if (ordered.includes(name) || trail.includes(name)) return;
    for (const other of removing) {
      if (manifestFor(manifests, other).requires.includes(name)) visit(other, [...trail, name]);
    }
    ordered.push(name);
  };
  for (const name of removing) visit(name, []);
  return { remove: ordered, keep };
}
