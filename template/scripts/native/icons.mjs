#!/usr/bin/env node
// Generates per-environment launcher icons (Android flavors + iOS app icon sets) from the PNGs in
// src/assets/icons-source/. Dev and staging get a bottom ribbon; prod stays clean.
//
// Output is deterministic (no timestamps, no system fonts: ribbon letters are vector paths), so a
// second run produces byte-identical files. Run it with `yarn icons`.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = path.join(root, 'src/assets/icons-source');
const iosApp = 'TempoApp';

// Mirrors the environment matrix in specs/PLAN.md section B2.
const ENVIRONMENTS = [
  { flavor: 'dev', iosSet: 'AppIcon-Dev', badge: { text: 'DEV', color: '#F97316' } },
  { flavor: 'staging', iosSet: 'AppIcon-Staging', badge: { text: 'STG', color: '#8B5CF6' } },
  { flavor: 'prod', iosSet: 'AppIcon', badge: null },
];

const LEGACY_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive icon layers are 108dp.
const FOREGROUND_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const RIBBON_HEIGHT_RATIO = 0.26; // ribbon band, as a share of the icon height
const TEXT_HEIGHT_RATIO = 0.18; // letter height, as a share of the icon height
const ADAPTIVE_BACKGROUND = '#FFFFFF';

// Block letters on a 10x14 grid, drawn as strokes so no font is needed.
const GLYPHS = {
  D: 'M1 1H5Q9 1 9 7Q9 13 5 13H1Z',
  E: 'M9 1H1V13H9M1 7H7',
  V: 'M1 1L5 13L9 1',
  S: 'M9 1H3L1 3V5L3 7H7L9 9V11L7 13H1',
  T: 'M1 1H9M5 1V13',
  G: 'M9 3L7 1H3L1 3V11L3 13H7L9 11V7H5',
};
const GLYPH_WIDTH = 10;
const GLYPH_HEIGHT = 14;
const GLYPH_GAP = 3;
const GLYPH_STROKE = 2.8;

/** Builds the SVG for a ribbon with the label centered in a band of `box`. */
function ribbonSvg(canvas, box, badge, clipRadius) {
  const bandHeight = box.height * RIBBON_HEIGHT_RATIO;
  const bandY = box.y + box.height - bandHeight;
  const scale = (box.height * TEXT_HEIGHT_RATIO) / GLYPH_HEIGHT;
  const letters = [...badge.text];
  const textWidth = (letters.length * GLYPH_WIDTH + (letters.length - 1) * GLYPH_GAP) * scale;
  const startX = box.x + (box.width - textWidth) / 2;
  const startY = bandY + (bandHeight - GLYPH_HEIGHT * scale) / 2;
  const paths = letters
    .map((letter, index) => {
      const x = startX + index * (GLYPH_WIDTH + GLYPH_GAP) * scale;
      return `<path transform="translate(${x} ${startY}) scale(${scale})" d="${GLYPHS[letter]}"/>`;
    })
    .join('');
  // Strokes are scaled together with each glyph, so the stroke width is expressed in glyph units.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
      `<defs><clipPath id="clip"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${clipRadius}"/></clipPath></defs>` +
      `<g clip-path="url(#clip)"><rect x="${box.x}" y="${bandY}" width="${box.width}" height="${bandHeight}" fill="${badge.color}"/></g>` +
      `<g fill="none" stroke="#FFFFFF" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
      `</svg>`,
  );
}

const PNG_OPTIONS = { compressionLevel: 9, adaptiveFiltering: false };

/** Returns the source image with the environment ribbon composited on top (unchanged for prod). */
async function withBadge(file, box, badge, clipRadius) {
  const input = path.join(sourceDir, file);
  if (!badge) return sharp(input).png(PNG_OPTIONS).toBuffer();
  const { width } = await sharp(input).metadata();
  return sharp(input)
    .composite([{ input: ribbonSvg(width, box, badge, clipRadius) }])
    .png(PNG_OPTIONS)
    .toBuffer();
}

async function resizeTo(buffer, size) {
  return sharp(buffer).resize(size, size, { kernel: 'lanczos3' }).png(PNG_OPTIONS).toBuffer();
}

async function roundMask(buffer, size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  return sharp(buffer)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png(PNG_OPTIONS)
    .toBuffer();
}

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${ADAPTIVE_BACKGROUND}</color>
</resources>
`;

const iosContents = `${JSON.stringify(
  {
    images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  },
  null,
  2,
)}\n`;

async function writeFileEnsured(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

async function generateAndroid({ flavor, badge }) {
  const res = path.join(root, 'android/app/src', flavor, 'res');
  // Legacy icon: the ribbon spans the full-bleed square. Foreground: the ribbon sits on the 288px tile.
  const legacy = await withBadge(
    'app-icon.png',
    { x: 0, y: 0, width: 1024, height: 1024 },
    badge,
    0,
  );
  const foreground = await withBadge(
    'app-icon-foreground.png',
    { x: 72, y: 72, width: 288, height: 288 },
    badge,
    48,
  );

  for (const [density, size] of Object.entries(LEGACY_SIZES)) {
    const resized = await resizeTo(legacy, size);
    const dir = path.join(res, `mipmap-${density}`);
    await writeFileEnsured(path.join(dir, 'ic_launcher.png'), resized);
    await writeFileEnsured(path.join(dir, 'ic_launcher_round.png'), await roundMask(resized, size));
  }
  for (const [density, size] of Object.entries(FOREGROUND_SIZES)) {
    await writeFileEnsured(
      path.join(res, `mipmap-${density}`, 'ic_launcher_foreground.png'),
      await resizeTo(foreground, size),
    );
  }
  await writeFileEnsured(path.join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptiveXml);
  await writeFileEnsured(path.join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptiveXml);
  await writeFileEnsured(path.join(res, 'values/ic_launcher_background.xml'), backgroundXml);
}

async function generateIos({ iosSet, badge }) {
  const dir = path.join(root, 'ios', iosApp, 'Images.xcassets', `${iosSet}.appiconset`);
  const icon = await withBadge('app-icon.png', { x: 0, y: 0, width: 1024, height: 1024 }, badge, 0);
  // App Store icons must not have an alpha channel.
  const flat = await sharp(icon)
    .flatten({ background: '#FFFFFF' })
    .removeAlpha()
    .png(PNG_OPTIONS)
    .toBuffer();
  await writeFileEnsured(path.join(dir, 'icon-1024.png'), flat);
  await writeFileEnsured(path.join(dir, 'Contents.json'), iosContents);
}

/** Removes the stock React Native launcher icons now superseded by the flavor resources. */
async function removeStockAndroidIcons() {
  const mainRes = path.join(root, 'android/app/src/main/res');
  for (const entry of await readdir(mainRes)) {
    if (entry.startsWith('mipmap-'))
      await rm(path.join(mainRes, entry), { recursive: true, force: true });
  }
}

await removeStockAndroidIcons();
for (const environment of ENVIRONMENTS) {
  await generateAndroid(environment);
  await generateIos(environment);
}
console.log(`Generated icons for: ${ENVIRONMENTS.map((e) => e.flavor).join(', ')}`);
