import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { renderSources } from '../native/icons-render.mjs';
import { generateIcons } from '../native/icons.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sources = path.join(root, 'src/assets/icons-source');
const names = ['forest', 'ocean', 'sunset'];

async function hashes(dir) {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const result = {};
  for (const entry of files.filter((file) => file.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    result[path.relative(dir, file)] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  return result;
}

async function rgb(file, x, y) {
  return (
    await sharp(file)
      .extract({ left: x, top: y, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer()
  ).toString('hex');
}

it('AC-I-3: SVG rendering reproduces the flat sources and transparent adaptive layers', async (t) => {
  const out = await mkdtemp(path.join(tmpdir(), 'tempo-icon-art-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  await renderSources(path.join(sources, 'svg'), out);
  for (const name of ['default', ...names]) {
    const preview = await sharp(path.join(out, 'previews', name + '.png')).metadata();
    assert.deepEqual([preview.width, preview.height], [96, 96]);
  }
  for (const [relative, hash] of Object.entries(await hashes(out))) {
    assert.equal(
      hash,
      createHash('sha256')
        .update(await readFile(path.join(sources, relative)))
        .digest('hex'),
      relative,
    );
  }
});

it('AC-I-3: each alternate has deterministic iOS, legacy, round and adaptive resources with its environment ribbon', async (t) => {
  const out = await mkdtemp(path.join(tmpdir(), 'tempo-icon-output-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  await generateIcons(out);
  const before = await hashes(out);
  await generateIcons(out);
  assert.deepEqual(await hashes(out), before);

  const config = path.join(root, 'ios/Config');
  const settings = await readFile(path.join(out, 'ios/Config/AlternateIcons.xcconfig'), 'utf8');
  assert.equal(
    settings.split('\n')[1],
    'ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ' +
      names
        .map(
          (name) =>
            '$(ASSETCATALOG_COMPILER_APPICON_NAME)-' + name[0].toUpperCase() + name.slice(1),
        )
        .join(' '),
  );
  const project = JSON.parse(await readFile(path.join(root, '.tempo.json'), 'utf8'));
  for (const [env, ribbon] of [
    ['Dev', 'f97316'],
    ['Staging', '8b5cf6'],
    ['Prod', null],
  ]) {
    const shared = await readFile(path.join(config, env + '.shared.xcconfig'), 'utf8');
    assert.match(shared, /#include\? "AlternateIcons\.xcconfig"/);
    const primary = shared.match(/^ASSETCATALOG_COMPILER_APPICON_NAME = (.+)$/m)[1];
    const res = path.join(out, 'android/app/src', env.toLowerCase(), 'res');
    for (const variant of names) {
      const name = 'ic_launcher_' + variant;
      const base = await rgb(path.join(sources, 'alternates', variant + '.png'), 0, 0);
      const set = primary + '-' + variant[0].toUpperCase() + variant.slice(1);
      const dir = path.join(out, 'ios', project.app.name, 'Images.xcassets', set + '.appiconset');
      const { images } = JSON.parse(await readFile(path.join(dir, 'Contents.json'), 'utf8'));
      const iosIcon = path.join(dir, images[0].filename);
      assert.equal((await sharp(iosIcon).metadata()).hasAlpha, false);
      assert.equal(await rgb(iosIcon, 64, 950), ribbon ?? base);
      const legacy = path.join(res, 'mipmap-mdpi', name + '.png');
      assert.equal(await rgb(legacy, 5, 43), ribbon ?? base);
      assert.equal(await rgb(legacy, 2, 10), base);
      const foreground = path.join(res, 'mipmap-mdpi', name + '_foreground.png');
      const pixel = await sharp(foreground)
        .extract({ left: 30, top: 76, width: 1, height: 1 })
        .raw()
        .toBuffer();
      assert.equal(pixel.toString('hex'), ribbon ? ribbon + 'ff' : '00000000');
      const legacyRound = path.join(res, 'mipmap-mdpi', name + '_round.png');
      assert.equal((await sharp(legacyRound).metadata()).hasAlpha, true);
      for (const suffix of ['', '_round']) {
        const xml = await readFile(
          path.join(res, 'mipmap-anydpi-v26', name + suffix + '.xml'),
          'utf8',
        );
        assert.ok(xml.includes(`@mipmap/${name}_foreground"`));
        assert.ok(xml.includes(`@color/${name}_background"`));
      }
      assert.ok(
        (await readFile(path.join(res, 'values', name + '_background.xml'), 'utf8')).includes(
          '#' + base,
        ),
      );
    }
  }
});
