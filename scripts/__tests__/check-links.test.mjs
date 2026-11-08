import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { checkRepo, extractLinks, headingSlugs, slugify, stripCode } from '../check-links.mjs';

describe('slugify', () => {
  it('lowercases, drops punctuation and turns spaces into hyphens', () => {
    assert.equal(slugify('Add an env var (fast)!'), 'add-an-env-var-fast');
    assert.equal(slugify('node_modules / a-b'), 'node_modules--a-b');
    assert.equal(slugify('عنوان 1'), 'عنوان-1');
  });
});

describe('stripCode', () => {
  it('blanks fenced blocks and inline code and keeps line numbers', () => {
    const text = ['a `[x](y)` b', '```md', '[z](w)', '```', '[ok](k)'].join('\n');
    const stripped = stripCode(text).split('\n');
    assert.equal(stripped.length, 5);
    assert.ok(!stripped.join('').includes('[x](y)'));
    assert.ok(!stripped.join('').includes('[z](w)'));
    assert.equal(stripped[4], '[ok](k)');
  });
});

describe('headingSlugs', () => {
  it('numbers duplicates, strips formatting and supports custom ids', () => {
    const slugs = headingSlugs(
      '# One\n## `Code` and [link](x)\n## One\n### Custom [#my-id]\n```\n# not a heading\n```\n',
    );
    assert.deepEqual([...slugs], ['one', 'code-and-link', 'one-1', 'my-id']);
  });
});

describe('extractLinks', () => {
  it('finds markdown links, images, href attributes and reference links with line numbers', () => {
    const text = [
      '[a](./a.md "title")',
      '![i](img.png) and <a href="/docs/x#y">z</a>',
      '[ref]: ./r.md',
      '`[c](code.md)`',
    ].join('\n');
    assert.deepEqual(
      extractLinks(text).map(({ target, line }) => [target, line]),
      [
        ['./a.md', 1],
        ['img.png', 2],
        ['/docs/x#y', 2],
        ['./r.md', 3],
      ],
    );
  });
});

describe('checkRepo', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'links-'));
    mkdirSync(path.join(root, 'docs/content/docs/guides'), { recursive: true });
    mkdirSync(path.join(root, 'template/node_modules/pkg'), {
      recursive: true,
    });
    writeFileSync(path.join(root, 'docs/content/docs/index.mdx'), '# Home\n');
    writeFileSync(
      path.join(root, 'docs/content/docs/guides/index.mdx'),
      '# Guides\n## Add a thing\n',
    );
    writeFileSync(path.join(root, 'template/node_modules/pkg/README.md'), '[bad](./nope.md)');
    writeFileSync(path.join(root, 'template/other.md'), '# Other\n');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts valid relative, /docs and anchor links and skips external ones and node_modules', () => {
    writeFileSync(
      path.join(root, 'template/README.md'),
      '# R\n[a](./other.md#other) [b](#r) [c](/docs/guides#add-a-thing) [d](/docs) [e](https://x.y/z) [f](mailto:a@b.c)\n',
    );
    assert.deepEqual(checkRepo(root), []);
  });

  it('reports missing files, docs pages and anchors with file and line', () => {
    writeFileSync(
      path.join(root, 'template/README.md'),
      '# R\n[a](./missing.md)\n[b](/docs/nope)\n[c](./other.md#nope)\n[d](#nope)\n',
    );
    const problems = checkRepo(root);
    assert.deepEqual(
      problems.map(({ file, line }) => [file, line]),
      [
        ['template/README.md', 2],
        ['template/README.md', 3],
        ['template/README.md', 4],
        ['template/README.md', 5],
      ],
    );
    assert.match(problems[0].message, /file not found/);
    assert.match(problems[1].message, /no docs page/);
    assert.match(problems[2].message, /anchor #nope/);
  });
});
