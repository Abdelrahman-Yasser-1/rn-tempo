import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CliError } from '../src/lib/errors.ts';
import { walkFiles, pathExists } from '../src/lib/fs-utils.ts';
import {
  generateComponent,
  generateFeature,
  generateHook,
  generateQuery,
  generateScreen,
  generateStore,
  type ScaffoldOptions,
} from '../src/lib/scaffold.ts';
import { readTempoJson, writeTempoJson } from '../src/lib/tempo-json.ts';
import { copyFixtureProject, FIXTURES_DIR, makeTempDir, TEMPLATE_DIR } from './helpers.ts';

const FIXED_DATE = new Date('2026-03-04T12:00:00Z');

/** Full file list of a `tempo g feature wallet` run (feature tree plus its first screen). */
const FEATURE_WALLET_FILES = [
  'specs/wallet/design.md',
  'specs/wallet/spec.md',
  'specs/wallet/tasks.md',
  'src/features/wallet/api/keys.ts',
  'src/features/wallet/api/queries.ts',
  'src/features/wallet/constants.ts',
  'src/features/wallet/index.ts',
  'src/features/wallet/screens/WalletScreen/WalletScreen.test.tsx',
  'src/features/wallet/screens/WalletScreen/WalletScreen.tsx',
  'src/features/wallet/screens/WalletScreen/index.ts',
  'src/features/wallet/screens/WalletScreen/styles.ts',
  'src/features/wallet/types/index.ts',
  'src/locales/ar/wallet.json',
  'src/locales/en/wallet.json',
];

describe('scaffold generators', () => {
  let dir = '';
  let cleanup = async () => {};
  const options = (overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions => ({ projectDir: dir, date: FIXED_DATE, ...overrides });
  const read = (rel: string) => readFile(path.join(dir, rel), 'utf8');
  const sorted = (files: readonly string[]) => [...files].sort();

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-scaffold'));
    await copyFixtureProject(dir);
    // The real manifest enables storybook, so shared components get stories.
    await cp(path.join(TEMPLATE_DIR, '.tempo.json'), path.join(dir, '.tempo.json'));
    await mkdir(path.join(dir, 'src/navigation'), { recursive: true });
    await cp(path.join(FIXTURES_DIR, 'navigation/types.ts'), path.join(dir, 'src/navigation/types.ts'));
    await cp(path.join(FIXTURES_DIR, 'navigation/stacks.ts'), path.join(dir, 'src/navigation/stacks.ts'));
    await cp(path.join(FIXTURES_DIR, 'navigation/linking.ts'), path.join(dir, 'src/navigation/linking.ts'));
    await mkdir(path.join(dir, 'src/services/i18n'), { recursive: true });
    await cp(path.join(TEMPLATE_DIR, 'src/services/i18n/resources.ts'), path.join(dir, 'src/services/i18n/resources.ts'));
  });
  afterEach(async () => cleanup());

  describe('feature', () => {
    it('creates the feature tree, first screen and specs, and registers the i18n namespace', async () => {
      const result = await generateFeature('wallet', options());

      expect(sorted(result.created)).toEqual(FEATURE_WALLET_FILES);
      // The ParamList route is always added; the navigator entry needs --register (not passed here).
      expect(sorted(result.updated)).toEqual([
        'src/features/wallet/index.ts',
        'src/locales/ar/wallet.json',
        'src/locales/en/wallet.json',
        'src/navigation/types.ts',
        'src/services/i18n/resources.ts',
      ]);
      expect(result.followUps).toContain('Add "wallet" to extraScopes in commitlint.config.mjs so commits can use the wallet scope');
      expect(result.followUps).toContain('Fill in specs/wallet/spec.md and set status: approved before implementing');

      const resources = await read('src/services/i18n/resources.ts');
      expect(resources).toContain("import enWallet from '@locales/en/wallet.json';");
      expect(resources).toContain("import arWallet from '@locales/ar/wallet.json';");
      expect(resources).toMatch(/en: \{[\s\S]*\bwallet: enWallet,\n[\s\S]*\},\n  ar: \{/);
      expect(resources).toMatch(/ar: \{[\s\S]*\bwallet: arWallet,\n[\s\S]*\},\n\};/);

      expect(JSON.parse(await read('src/locales/en/wallet.json'))).toEqual({ screens: { wallet: { title: 'Wallet' } } });
      expect(await read('src/features/wallet/index.ts')).toContain("export { WalletScreen } from './screens/WalletScreen';");
    });

    it('refuses an existing feature without --force, and a forced rerun does not duplicate registrations', async () => {
      await generateFeature('wallet', options());
      await expect(generateFeature('wallet', options())).rejects.toMatchObject({ code: 'FILE_EXISTS' });

      const resourcesOnce = await read('src/services/i18n/resources.ts');
      const again = await generateFeature('wallet', options({ force: true }));
      expect(again.updated).not.toContain('src/services/i18n/resources.ts');
      expect(await read('src/services/i18n/resources.ts')).toBe(resourcesOnce);
    });

    it('dry-run reports the same files as a real run and writes nothing', async () => {
      const before = await snapshot();
      const preview = await generateFeature('wallet', options({ dryRun: true }));
      expect(await snapshot()).toEqual(before);

      const real = await generateFeature('wallet', options());
      expect(sorted(preview.created)).toEqual(sorted(real.created));
      expect(sorted(preview.updated)).toEqual(sorted(real.updated));
      expect(preview.updated).toContain('src/services/i18n/resources.ts');
      expect(preview.followUps).toEqual(real.followUps);
    });
  });

  describe('screen', () => {
    it('creates the screen folder, feature barrel export and locale keys', async () => {
      const result = await generateScreen('Detail', 'items', options());

      expect(sorted(result.created)).toEqual([
        'src/features/items/screens/DetailScreen/DetailScreen.test.tsx',
        'src/features/items/screens/DetailScreen/DetailScreen.tsx',
        'src/features/items/screens/DetailScreen/index.ts',
        'src/features/items/screens/DetailScreen/styles.ts',
      ]);
      expect(sorted(result.updated)).toEqual([
        'src/features/items/index.ts',
        'src/locales/ar/items.json',
        'src/locales/en/items.json',
        'src/navigation/types.ts',
      ]);
      expect(JSON.parse(await read('src/locales/en/items.json')).screens.detail.title).toBe('Detail');
      expect(await read('src/features/items/screens/DetailScreen/DetailScreen.tsx')).toContain("t('screens.detail.title')");
    });

    it('throws FEATURE_NOT_FOUND when the feature does not exist', async () => {
      await expect(generateScreen('Detail', 'missing', options())).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
      expect(await pathExists(path.join(dir, 'src/features/missing'))).toBe(false);
    });

    it('refuses to overwrite a screen without --force and keeps the barrel to a single export', async () => {
      await generateScreen('Detail', 'items', options());
      const screenFile = path.join(dir, 'src/features/items/screens/DetailScreen/DetailScreen.tsx');
      await writeFile(screenFile, 'hand edited\n');

      const error = await generateScreen('Detail', 'items', options()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('FILE_EXISTS');
      expect(await readFile(screenFile, 'utf8')).toBe('hand edited\n');
      const barrelLines = (await read('src/features/items/index.ts')).split('\n').filter((line) => line.includes('DetailScreen'));
      expect(barrelLines).toEqual(["export { DetailScreen } from './screens/DetailScreen';"]);

      await generateScreen('Detail', 'items', options({ force: true }));
      expect(await readFile(screenFile, 'utf8')).toContain('export function DetailScreen');
    });

    it('with register, adds the route to the ParamList and the navigator', async () => {
      const result = await generateScreen('Detail', 'items', options({ register: true }));
      expect(result.register?.updated).toEqual(['src/navigation/types.ts', 'src/navigation/stacks.ts', 'src/navigation/linking.ts']);
      expect(result.followUps).toEqual([]);
      expect(await read('src/navigation/types.ts')).toContain('  Detail: undefined;');
      expect(await read('src/navigation/stacks.ts')).toContain('Detail: { screen: DetailScreen, linking: LINK_PATHS.Detail },');
      expect(await read('src/navigation/linking.ts')).toContain("  Detail: 'detail',");
    });

    it('without register, leaves navigation alone and returns a follow-up note', async () => {
      const navBefore = await read('src/navigation/stacks.ts');
      const result = await generateScreen('Detail', 'items', options());
      expect(await read('src/navigation/stacks.ts')).toBe(navBefore);
      expect(result.followUps).toEqual([expect.stringContaining('or re-run with --register')]);
    });
  });

  describe('component', () => {
    it('creates a shared component with stories and exports it from the shared barrel', async () => {
      const result = await generateComponent('Badge', undefined, options());

      expect(sorted(result.created)).toEqual([
        'src/shared/components/Badge/Badge.stories.tsx',
        'src/shared/components/Badge/Badge.test.tsx',
        'src/shared/components/Badge/Badge.tsx',
        'src/shared/components/Badge/index.ts',
        'src/shared/components/Badge/styles.ts',
        'src/shared/components/Badge/types.ts',
      ]);
      expect(result.updated).toEqual(['src/shared/components/index.ts']);
      expect(await read('src/shared/components/index.ts')).toBe("export { Badge } from './Badge';\n");
    });

    it('skips stories for shared components when storybook is disabled', async () => {
      const tempo = await readTempoJson(dir);
      await writeTempoJson(dir, { ...tempo, features: tempo.features.filter((feature) => feature !== 'storybook') });
      const result = await generateComponent('Badge', undefined, options());
      expect(result.created.some((file) => file.endsWith('.stories.tsx'))).toBe(false);
      expect(result.created).toContain('src/shared/components/Badge/Badge.tsx');
    });

    it('creates a feature component without stories or barrel changes', async () => {
      const result = await generateComponent('Price', 'items', options());
      expect(sorted(result.created)).toEqual([
        'src/features/items/components/Price/Price.test.tsx',
        'src/features/items/components/Price/Price.tsx',
        'src/features/items/components/Price/index.ts',
        'src/features/items/components/Price/styles.ts',
        'src/features/items/components/Price/types.ts',
      ]);
      expect(result.updated).toEqual([]);
    });

    it('throws FEATURE_NOT_FOUND for a missing feature', async () => {
      await expect(generateComponent('Price', 'missing', options())).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
    });
  });

  describe('hook', () => {
    it('strips the use prefix, creates a shared hook and exports it from the hooks barrel', async () => {
      const result = await generateHook('useCounter', undefined, options());
      expect(sorted(result.created)).toEqual(['src/shared/hooks/useCounter.test.ts', 'src/shared/hooks/useCounter.ts']);
      expect(result.updated).toEqual(['src/shared/hooks/index.ts']);
      expect(await read('src/shared/hooks/index.ts')).toBe("export { useCounter } from './useCounter';\n");
    });

    it('creates a feature hook', async () => {
      const result = await generateHook('counter', 'items', options());
      expect(sorted(result.created)).toEqual(['src/features/items/hooks/useCounter.test.ts', 'src/features/items/hooks/useCounter.ts']);
      expect(result.updated).toEqual([]);
    });

    it('throws FEATURE_NOT_FOUND for a missing feature', async () => {
      await expect(generateHook('counter', 'missing', options())).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
    });
  });

  describe('store and query', () => {
    it('creates a Zustand store with its test inside the feature', async () => {
      const result = await generateStore('cart', 'items', options());
      expect(sorted(result.created)).toEqual(['src/features/items/store/cart.store.test.ts', 'src/features/items/store/cart.store.ts']);
      expect(await read('src/features/items/store/cart.store.ts')).toContain('export const useCartStore');
    });

    it('creates a TanStack Query hook inside the feature api folder', async () => {
      const result = await generateQuery('products', 'items', options());
      expect(result.created).toEqual(['src/features/items/api/productsQueries.ts']);
      expect(result.followUps).toEqual(['Move the query key into src/features/items/api/keys.ts if other code invalidates it']);
    });

    it('both throw FEATURE_NOT_FOUND without an existing feature', async () => {
      await expect(generateStore('cart', 'missing', options())).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
      await expect(generateQuery('products', 'missing', options())).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
    });
  });

  describe('dry-run', () => {
    it('previews barrels, locales, route registration and deep links exactly like a real run', async () => {
      const before = await snapshot();
      const preview = await generateScreen('Detail', 'items', options({ dryRun: true, register: true }));
      expect(await snapshot()).toEqual(before);
      expect(sorted(preview.updated)).toEqual([
        'src/features/items/index.ts',
        'src/locales/ar/items.json',
        'src/locales/en/items.json',
        'src/navigation/linking.ts',
        'src/navigation/stacks.ts',
        'src/navigation/types.ts',
      ]);
      const real = await generateScreen('Detail', 'items', options({ register: true }));
      expect(sorted(preview.updated)).toEqual(sorted(real.updated));

      const shared = await generateComponent('Chip', undefined, options({ dryRun: true }));
      expect(shared.updated).toEqual(['src/shared/components/index.ts']);
      const hook = await generateHook('useThing', undefined, options({ dryRun: true }));
      expect(hook.updated).toEqual(['src/shared/hooks/index.ts']);
    });

    it('writes nothing for screen, component, hook, store and query', async () => {
      const before = await snapshot();
      await generateScreen('Detail', 'items', options({ dryRun: true, register: true }));
      await generateComponent('Badge', undefined, options({ dryRun: true }));
      await generateHook('useCounter', undefined, options({ dryRun: true }));
      await generateStore('cart', 'items', options({ dryRun: true }));
      await generateQuery('products', 'items', options({ dryRun: true }));
      expect(await snapshot()).toEqual(before);
    });
  });

  /** Every file in the project with its contents, so any write shows up as a difference. */
  async function snapshot(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const rel of await walkFiles(dir)) out[rel] = await read(rel);
    return out;
  }
});
