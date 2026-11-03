import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { checkAssets, generateAssets } from '../assets.mjs';
import {
  findUsedIcons,
  listSourceFiles,
  nameLiterals,
  pruneIcons,
  readKeepList,
  runPruned,
} from '../icons-prune.mjs';

const TEMP_DIRS = [];
const svg = (seed) =>
  `<svg viewBox="0 0 24 24"><path stroke="#000" d="M${seed} 1h2v2H1z"/></svg>\n`;
const ICONS = ['home', 'search', 'bell', 'flag-us', 'flag-de', 'unused-one'];

/** A project with icons and source files; `files` are paths under src with their code. */
function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'icons-prune-test-'));
  TEMP_DIRS.push(root);
  const srcDir = join(root, 'src');
  const assetsDir = join(srcDir, 'assets');
  const all = {
    ...Object.fromEntries(ICONS.map((name, index) => [`assets/icons/${name}.svg`, svg(index + 1)])),
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(srcDir, path)), { recursive: true });
    writeFileSync(join(srcDir, path), content);
  }
  return { srcDir, assetsDir, generatedDir: join(assetsDir, 'generated'), root };
}

after(() => {
  for (const dir of TEMP_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('literal detection', () => {
  it('finds quoted names in all three quote styles, and not expressions or other text', () => {
    const code = `
      <Icon name="home" /> <Icon name={'search'} /> const x = \`bell\`;
      const y = \`flag-\${code}\`; const z = 'Not An Icon'; const w = 'a/b';
    `;
    assert.deepEqual([...nameLiterals(code)].sort(), ['bell', 'home', 'search']);
  });

  it('skips tests, stories, declaration files and generated code', () => {
    const { srcDir } = project({
      'features/a/A.tsx': 'x',
      'features/a/A.test.tsx': 'x',
      'features/a/A.stories.tsx': 'x',
      'features/a/__tests__/b.ts': 'x',
      'types/x.d.ts': 'x',
      'assets/generated/icons.registry.ts': 'x',
      'shared/b.ts': 'x',
    });

    const files = listSourceFiles(srcDir).map((file) => file.slice(srcDir.length + 1));
    assert.deepEqual(files, ['features/a/A.tsx', 'shared/b.ts']);
  });
});

describe('used icons', () => {
  it('counts literals in the source, constants and maps included, and the keep list', () => {
    const { srcDir, assetsDir } = project({
      'features/a/A.tsx':
        "export const TABS = { first: 'home' } as const; // 'bell' in a comment\n",
      'features/a/A.test.tsx': "it('search', () => {});\n",
      'assets/icons.keep.ts': "export const ICON_KEEP = ['flag-us', 'flag-de', 'not-an-icon'];\n",
    });
    const keepFile = join(assetsDir, 'icons.keep.ts');

    assert.deepEqual([...readKeepList(keepFile)].sort(), ['flag-de', 'flag-us', 'not-an-icon']);
    assert.deepEqual([...findUsedIcons({ srcDir, keepFile, allNames: ICONS })].sort(), [
      'bell',
      'flag-de',
      'flag-us',
      'home',
    ]);
    assert.deepEqual([...readKeepList(join(srcDir, 'missing.ts'))], []);
  });
});

describe('pruneIcons', () => {
  it('generates only the used icons, is idempotent, and restores by generating everything', () => {
    const { srcDir, assetsDir, generatedDir } = project({
      'features/a/A.tsx': "export const ICON = 'home';\n",
      'assets/icons.keep.ts': "export const ICON_KEEP = ['flag-us'];\n",
    });
    const read = (file) => readFileSync(join(generatedDir, file), 'utf8');

    const result = pruneIcons({ srcDir, assetsDir, generatedDir });
    assert.equal(result.kept, 2);
    assert.equal(result.total, ICONS.length);
    assert.ok(result.bytesSaved > 0);
    assert.match(read('icons.registry.ts'), /Partial<Record<IconName, IconComponent>>/);
    assert.match(read('icons.registry.ts'), /home: Home,/);
    assert.match(read('icons.registry.ts'), /'flag-us': FlagUs,/);
    assert.doesNotMatch(read('icons.registry.ts'), /Bell|UnusedOne/);
    assert.match(read('icons.types.ts'), /\| 'unused-one'/);

    const before = read('icons.registry.ts');
    assert.equal(pruneIcons({ srcDir, assetsDir, generatedDir }).kept, 2);
    assert.equal(read('icons.registry.ts'), before);

    assert.ok(checkAssets(assetsDir, generatedDir).length > 0);
    generateAssets(assetsDir, generatedDir);
    assert.deepEqual(checkAssets(assetsDir, generatedDir), []);
    assert.match(read('icons.registry.ts'), /Record<IconName, IconComponent> = \{/);
  });

  it('runPruned prunes first, restores afterwards, and returns the command status', () => {
    const calls = [];
    const status = runPruned([process.execPath, '-e', 'process.exit(3)'], {
      prune: () => calls.push('prune'),
      restore: () => calls.push('restore'),
    });

    assert.equal(status, 3);
    assert.deepEqual(calls, ['prune', 'restore']);
  });
});
