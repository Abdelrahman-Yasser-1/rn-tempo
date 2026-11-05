import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  hashFiles,
  isVendoredFile,
  main,
  readVendored,
  stripImages,
} from '../ai-skills-update.mjs';

describe('stripImages', () => {
  it('drops image-only lines and keeps the alt text of inline images', () => {
    const input =
      'Before\n![Graph](images/fps.png)\nSee ![the chart](images/a.PNG "t") here\n![](x.svg)\nAfter';

    assert.equal(stripImages(input), 'Before\nSee the chart here\nAfter');
  });

  it('leaves normal links alone', () => {
    assert.equal(
      stripImages('[doc](docs/a.md) and ![x](https://example.com/page)'),
      '[doc](docs/a.md) and ![x](https://example.com/page)',
    );
  });
});

describe('isVendoredFile', () => {
  it('keeps text and drops everything else', () => {
    assert.equal(isVendoredFile('SKILL.md'), true);
    assert.equal(isVendoredFile('agents/openai.yaml'), true);
    assert.equal(isVendoredFile('images/a.png'), false);
    assert.equal(isVendoredFile('script.sh'), false);
  });
});

describe('hashFiles', () => {
  it('ignores file order and changes with content', () => {
    const a = hashFiles([
      ['a.md', '1'],
      ['b.md', '2'],
    ]);

    assert.equal(
      a,
      hashFiles([
        ['b.md', '2'],
        ['a.md', '1'],
      ]),
    );
    assert.notEqual(
      a,
      hashFiles([
        ['a.md', '1'],
        ['b.md', '3'],
      ]),
    );
  });
});

describe('--check', () => {
  let cwd;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'ai-skills-'));
    mkdirSync(path.join(cwd, 'ai/skills/demo'), { recursive: true });
    writeFileSync(path.join(cwd, 'ai/skills/demo/SKILL.md'), '# demo\n');
    writeFileSync(path.join(cwd, 'ai/skills/demo/VENDORED.md'), 'note, not hashed\n');
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const writeLock = (hash) =>
    writeFileSync(
      path.join(cwd, 'ai/skills-lock.json'),
      JSON.stringify({ version: 1, skills: { demo: { computedHash: hash } } }),
    );

  it('passes when the files match the lock', async () => {
    writeLock(hashFiles(readVendored(path.join(cwd, 'ai/skills/demo'))));

    assert.equal(await main(['--check'], cwd), 0);
  });

  it('fails when a vendored file was edited', async () => {
    writeLock(hashFiles(readVendored(path.join(cwd, 'ai/skills/demo'))));
    writeFileSync(path.join(cwd, 'ai/skills/demo/SKILL.md'), '# edited\n');

    assert.equal(await main(['--check'], cwd), 1);
  });
});
