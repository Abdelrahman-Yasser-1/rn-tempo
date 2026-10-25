import { describe, expect, it } from 'vitest';
import type { FeatureManifest, FeatureName } from '@rn-tempo/contracts';

import { CliError } from '../src/lib/errors.ts';
import { defaultFeatures, loadManifests, parseManifest, planRemoval, resolveSelection } from '../src/lib/manifest.ts';
import { TEMPLATE_DIR } from './helpers.ts';

const base = (name: FeatureName, extra: Partial<FeatureManifest> = {}): FeatureManifest => ({
  name,
  title: name,
  description: name,
  defaultEnabled: true,
  requires: [],
  conflicts: [],
  deleteGlobs: [],
  dependencies: [],
  devDependencies: [],
  envKeys: [],
  jsonPatches: [],
  postRemove: [],
  docs: `/docs/features/${name}`,
  ...extra,
});

const manifests = new Map<FeatureName, FeatureManifest>([
  ['samples', base('samples', { requires: ['storybook'] })],
  ['storybook', base('storybook')],
  ['maestro', base('maestro', { requires: ['samples'] })],
  ['ssl-pinning', base('ssl-pinning', { conflicts: ['device-integrity'] })],
  ['device-integrity', base('device-integrity')],
]);

describe('loadManifests', () => {
  it('loads and validates every template manifest', async () => {
    const loaded = await loadManifests(TEMPLATE_DIR);
    expect(loaded.size).toBe(10);
    expect(defaultFeatures(loaded)).not.toContain('dynamic-forms');
    expect(defaultFeatures(loaded)).toContain('samples');
  });

  it('rejects a manifest with unknown fields', () => {
    expect(() => parseManifest({ ...base('samples'), extra: 1 }, 'x.json')).toThrow(CliError);
  });
});

describe('resolveSelection', () => {
  it('adds required features and reports them', () => {
    const result = resolveSelection(manifests, ['maestro']);
    expect(result.features).toEqual(['samples', 'storybook', 'maestro']);
    expect(result.added).toEqual(['samples', 'storybook']);
  });

  it('throws on conflicts', () => {
    expect(() => resolveSelection(manifests, ['ssl-pinning', 'device-integrity'])).toThrow(/conflict/);
  });
});

describe('planRemoval', () => {
  const enabled: FeatureName[] = ['samples', 'storybook', 'maestro'];

  it('refuses to remove a feature that a kept feature requires', () => {
    expect(() => planRemoval(manifests, enabled, ['storybook'])).toThrowError(
      expect.objectContaining({ details: ['"samples" requires "storybook"'] }) as Error,
    );
  });

  it('orders dependents before the features they require', () => {
    const plan = planRemoval(manifests, enabled, ['storybook', 'samples', 'maestro']);
    expect(plan.remove).toEqual(['maestro', 'samples', 'storybook']);
    expect(plan.keep).toEqual([]);
  });

  it('ignores features that are not enabled', () => {
    expect(planRemoval(manifests, ['storybook'], ['maestro']).remove).toEqual([]);
  });
});
