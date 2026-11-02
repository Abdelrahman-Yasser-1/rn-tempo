import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerRoute, type RegisterOptions } from '../src/lib/register.ts';
import { FIXTURES_DIR, makeTempDir } from './helpers.ts';

const TYPES = 'src/navigation/types.ts';
const STACKS = 'src/navigation/stacks.ts';
const LINKING = 'src/navigation/linking.ts';

describe('registerRoute', () => {
  let dir = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-register'));
    await mkdir(path.join(dir, 'src/navigation'), { recursive: true });
    await writeFile(path.join(dir, TYPES), await readFile(path.join(FIXTURES_DIR, 'navigation/types.ts'), 'utf8'));
    await writeFile(path.join(dir, STACKS), await readFile(path.join(FIXTURES_DIR, 'navigation/stacks.ts'), 'utf8'));
    await writeFile(path.join(dir, LINKING), await readFile(path.join(FIXTURES_DIR, 'navigation/linking.ts'), 'utf8'));
  });
  afterEach(async () => cleanup());

  const read = (rel: string) => readFile(path.join(dir, rel), 'utf8');
  const options = (overrides: Partial<RegisterOptions> = {}): RegisterOptions => ({
    projectDir: dir,
    stack: 'Home',
    routeName: 'Balance',
    component: 'BalanceScreen',
    importFrom: '@features/wallet',
    navigator: true,
    linkPath: 'balance',
    ...overrides,
  });

  it('adds the route to the stack ParamList and the screen to the navigator', async () => {
    const result = await registerRoute(options());

    expect(result.updated).toEqual([TYPES, STACKS, LINKING]);
    expect(result.notes).toEqual([]);

    const types = await read(TYPES);
    const homeParams = types.slice(types.indexOf('export type HomeStackParamList'), types.indexOf('export type ProfileStackParamList'));
    expect(homeParams).toContain('  Balance: undefined;\n');
    // Inserted after the samples markers, i.e. outside the removable module block.
    expect(homeParams.indexOf('Balance: undefined;')).toBeGreaterThan(homeParams.indexOf('@tempo-feature:samples:end'));

    const stacks = await read(STACKS);
    expect(stacks).toContain('      Balance: { screen: BalanceScreen, linking: LINK_PATHS.Balance },\n');
    expect(stacks).toContain("import { BalanceScreen } from '@features/wallet';");
    const homeStack = stacks.slice(stacks.indexOf('function createHomeStack'), stacks.indexOf('function createProfileStack'));
    expect(homeStack.indexOf('Balance: { screen: BalanceScreen, linking')).toBeGreaterThan(homeStack.indexOf('ItemCreate:'));
    expect(stacks.indexOf("import { BalanceScreen }")).toBeLessThan(stacks.indexOf("import { LINK_PATHS }"));
  });

  it('adds a kebab-case deep link path for the route to LINK_PATHS', async () => {
    await registerRoute(options({ routeName: 'BalanceDetails', component: 'BalanceDetailsScreen', linkPath: 'balance-details' }));
    const linking = await read(LINKING);
    expect(linking).toContain("  DebugMenu: 'debug',\n  BalanceDetails: 'balance-details',\n} as const;");
    expect(await read(STACKS)).toContain('BalanceDetails: { screen: BalanceDetailsScreen, linking: LINK_PATHS.BalanceDetails },');
  });

  it('wraps the navigator entry when it would pass 100 columns', async () => {
    const routeName = 'VeryLongRouteNameForWalletBalance';
    await registerRoute(options({ routeName, component: `${routeName}Screen`, linkPath: 'very-long' }));
    expect(await read(STACKS)).toContain(
      `      ${routeName}: {\n        screen: ${routeName}Screen,\n        linking: LINK_PATHS.${routeName},\n      },\n`,
    );
  });

  it('notes instead of failing when linking.ts is missing or has no LINK_PATHS, and adds a plain route', async () => {
    await rm(path.join(dir, LINKING));
    const missing = await registerRoute(options());
    expect(missing.updated).toEqual([TYPES, STACKS]);
    expect(missing.notes).toEqual([expect.stringContaining('Could not find LINK_PATHS in src/navigation/linking.ts')]);
    expect(await read(STACKS)).toContain('      Balance: { screen: BalanceScreen },\n');

    await writeFile(path.join(dir, LINKING), 'export const other = 1;\n');
    const unrecognised = await registerRoute(options({ routeName: 'Other', component: 'OtherScreen' }));
    expect(unrecognised.notes).toEqual([expect.stringContaining('Could not find LINK_PATHS')]);
    expect(await read(LINKING)).toBe('export const other = 1;\n');
  });

  it('does not reuse a deep link path that another route owns', async () => {
    const result = await registerRoute(options({ linkPath: 'profile' }));
    expect(result.notes).toEqual([expect.stringContaining('Deep link path "profile" is already used')]);
    expect(await read(STACKS)).toContain('      Balance: { screen: BalanceScreen },\n');
    expect(await read(LINKING)).not.toContain('Balance');
  });

  it('dry-run lists the updates without writing', async () => {
    const before = [await read(TYPES), await read(STACKS), await read(LINKING)];
    const result = await registerRoute(options({ dryRun: true }));
    expect(result.updated).toEqual([TYPES, STACKS, LINKING]);
    expect([await read(TYPES), await read(STACKS), await read(LINKING)]).toEqual(before);
  });

  it('only touches types.ts without navigator, with a hint to re-run with --register', async () => {
    const stacksBefore = await read(STACKS);
    const result = await registerRoute(options({ navigator: false }));

    expect(result.updated).toEqual([TYPES]);
    expect(result.notes).toEqual([
      'Add "Balance: { screen: BalanceScreen }" to the Home stack navigator (import from @features/wallet), or re-run with --register',
    ]);
    expect(await read(STACKS)).toBe(stacksBefore);
  });

  it('merges the screen into an existing import from the same module', async () => {
    await writeFile(
      path.join(dir, STACKS),
      [
        "import { createNativeStackNavigator } from '@react-navigation/native-stack';",
        "import { ExistingScreen } from '@features/wallet';",
        '',
        'export function createHomeStack(placeholder: unknown) {',
        '  return createNativeStackNavigator({',
        '    screens: {',
        '      Home: { screen: placeholder },',
        '    },',
        '  });',
        '}',
        '',
      ].join('\n'),
    );
    await registerRoute(options());
    const stacks = await read(STACKS);
    expect(stacks).toContain("import { BalanceScreen, ExistingScreen } from '@features/wallet';");
    expect(stacks.match(/from '@features\/wallet'/g)).toHaveLength(1);
  });

  it('is idempotent: a second run leaves both files byte-identical', async () => {
    await registerRoute(options());
    const typesOnce = await read(TYPES);
    const stacksOnce = await read(STACKS);
    const linkingOnce = await read(LINKING);

    const again = await registerRoute(options());

    expect(again).toEqual({ updated: [], notes: [] });
    expect(await read(TYPES)).toBe(typesOnce);
    expect(await read(STACKS)).toBe(stacksOnce);
    expect(await read(LINKING)).toBe(linkingOnce);
  });

  it('turns an unknown stack into notes instead of throwing', async () => {
    const typesBefore = await read(TYPES);
    const stacksBefore = await read(STACKS);

    const result = await registerRoute(options({ stack: 'Nope' }));

    expect(result.updated).toEqual([]);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toContain('Could not find NopeStackParamList in src/navigation/types.ts');
    expect(result.notes[1]).toContain('Could not find the Nope stack navigator in src/navigation');
    expect(await read(TYPES)).toBe(typesBefore);
    expect(await read(STACKS)).toBe(stacksBefore);
  });

  it('reports missing files as notes when the project has no navigation folder', async () => {
    await rm(path.join(dir, 'src/navigation'), { recursive: true, force: true });
    const result = await registerRoute(options());

    expect(result.updated).toEqual([]);
    expect(result.notes).toEqual([
      `src/navigation/types.ts not found. Add "Balance: undefined;" to HomeStackParamList in src/navigation/types.ts`,
      expect.stringContaining('Could not find the Home stack navigator in src/navigation'),
    ]);
  });
});
