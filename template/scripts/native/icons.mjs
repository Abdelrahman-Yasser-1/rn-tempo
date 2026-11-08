#!/usr/bin/env node
// Generates per-environment launcher icons (Android flavors + iOS app icon sets) from the PNGs in
// src/assets/icons-source/. Dev and staging get a bottom ribbon; prod stays clean.
//
// Output is deterministic (no timestamps, no system fonts: ribbon letters are vector paths), so a
// second run produces byte-identical files. Run it with `yarn icons`.
//
// Options (dev and staging only, prod is never labelled):
//   --label "<text>"  also draws a label such as "1.2.3 (45)" in a band on top of the icon. Fastlane uses it
//                     right before a build and regenerates the plain icons afterwards.
//   --env <name>      only generate this environment (default: all).
import { readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = path.join(root, 'src/assets/icons-source');
const DEFAULT_IOS_APP = 'TempoApp';

// Mirrors the environment matrix in specs/PLAN.md section B2. Used when .tempo.json is missing.
const DEFAULT_ENVIRONMENTS = [
  { flavor: 'dev', iosSet: 'AppIcon-Dev', badge: { text: 'DEV', color: '#F97316' } },
  { flavor: 'staging', iosSet: 'AppIcon-Staging', badge: { text: 'STG', color: '#8B5CF6' } },
  { flavor: 'prod', iosSet: 'AppIcon', badge: null },
];

// .tempo.json envs carry a badge label but no color: dev and staging keep their B2 colors, any other
// env gets this neutral slate.
const BADGE_COLORS = { dev: '#F97316', staging: '#8B5CF6' };
const NEUTRAL_BADGE_COLOR = '#64748B';

/** Reads the env matrix (name + badge) and app name from .tempo.json, falling back to the defaults. */
function loadProject() {
  try {
    const meta = JSON.parse(readFileSync(path.join(root, '.tempo.json'), 'utf8'));
    const environments = meta.envs.map((env) => ({
      flavor: env.name,
      // Same naming as ios-envs.rb: prod owns the plain AppIcon set, other envs get AppIcon-<Name>.
      iosSet:
        env.name === 'prod'
          ? 'AppIcon'
          : `AppIcon-${env.name.charAt(0).toUpperCase()}${env.name.slice(1)}`,
      badge: env.badge
        ? { text: env.badge, color: BADGE_COLORS[env.name] ?? NEUTRAL_BADGE_COLOR }
        : null,
    }));
    return { iosApp: meta.app.name, environments };
  } catch {
    return { iosApp: DEFAULT_IOS_APP, environments: DEFAULT_ENVIRONMENTS };
  }
}

const { iosApp, environments: ENVIRONMENTS } = loadProject();

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
  A: 'M1 13L5 1L9 13M2.8 9H7.2',
  B: 'M1 1H6Q9 1 9 4Q9 7 6 7H1M6 7Q9 7 9 10Q9 13 6 13H1V1',
  C: 'M9 3L7 1H3L1 3V11L3 13H7L9 11',
  H: 'M1 1V13M9 1V13M1 7H9',
  I: 'M1 1H9M5 1V13M1 13H9',
  L: 'M1 1V13H9',
  M: 'M1 13V1L5 7L9 1V13',
  N: 'M1 13V1L9 13V1',
  O: 'M3 1H7L9 3V11L7 13H3L1 11V3Z',
  P: 'M1 13V1H6Q9 1 9 4Q9 7 6 7H1',
  Q: 'M3 1H7L9 3V11L7 13H3L1 11V3ZM6 9L9 13',
  R: 'M1 13V1H6Q9 1 9 4Q9 7 6 7H1M5 7L9 13',
  U: 'M1 1V11L3 13H7L9 11V1',
};
const GLYPH_HEIGHT = 14;
const GLYPH_GAP = 3;
const GLYPH_STROKE = 2.8;

// Digits and punctuation for the build label, on the same grid.
Object.assign(GLYPHS, {
  0: 'M3 1H7L9 3V11L7 13H3L1 11V3Z',
  1: 'M3 3L5 1V13M2 13H8',
  2: 'M1 3L3 1H7L9 3V5L1 13H9',
  3: 'M1 2L3 1H7L9 3V5L7 7H4M7 7L9 9V11L7 13H3L1 12',
  4: 'M7 13V1L1 9H9',
  5: 'M9 1H2L1 7H6L9 9V11L7 13H3L1 11',
  6: 'M8 1H4L1 4V11L3 13H7L9 11V8L7 6H3L1 8',
  7: 'M1 1H9L4 13',
  8: 'M3 1H7L9 3V5L7 7H3L1 5V3ZM3 7H7L9 9V11L7 13H3L1 11V9Z',
  9: 'M9 6H3L1 5V3L3 1H7L9 3V10L6 13H2',
  '.': 'M1.5 12.6V13',
  '-': 'M2 7H8',
  '+': 'M5 3V11M1 7H9',
  '(': 'M5 1Q1 7 5 13',
  ')': 'M1 1Q5 7 1 13',
  ' ': '',
});
// Glyph widths on the grid; anything not listed is 10 wide.
const GLYPH_WIDTHS = { '.': 3, '(': 6, ')': 6, ' ': 4 };
const DEFAULT_GLYPH_WIDTH = 10;

const LABEL_BAND_RATIO = 0.2; // label band at the top, as a share of the icon height
const LABEL_MAX_WIDTH_RATIO = 0.9; // the label never exceeds this share of the icon width
const LABEL_COLOR = '#111827';

/** Lays a text out on the glyph grid: each glyph's path and x offset, plus the total width. */
function layoutText(text) {
  let x = 0;
  const glyphs = [];
  for (const letter of text) {
    if (!(letter in GLYPHS)) {
      throw new Error(`icons.mjs: no glyph for "${letter}"; add it to GLYPHS`);
    }
    glyphs.push({ d: GLYPHS[letter], x });
    x += (GLYPH_WIDTHS[letter] ?? DEFAULT_GLYPH_WIDTH) + GLYPH_GAP;
  }
  return { glyphs, width: Math.max(0, x - GLYPH_GAP) };
}

const glyphPaths = (glyphs, startX, startY, scale) =>
  glyphs
    .filter((glyph) => glyph.d !== '')
    .map(
      (glyph) =>
        `<path transform="translate(${startX + glyph.x * scale} ${startY}) scale(${scale})" d="${glyph.d}"/>`,
    )
    .join('');

/** Builds the SVG with the ribbon at the bottom of `box` and, when given, a label band on top. */
export function ribbonSvg(canvas, box, badge, clipRadius, label = '') {
  const bandHeight = box.height * RIBBON_HEIGHT_RATIO;
  const bandY = box.y + box.height - bandHeight;
  const scale = (box.height * TEXT_HEIGHT_RATIO) / GLYPH_HEIGHT;
  const { glyphs, width } = layoutText(badge.text);
  const textWidth = width * scale;
  const startX = box.x + (box.width - textWidth) / 2;
  const startY = bandY + (bandHeight - GLYPH_HEIGHT * scale) / 2;
  const paths = glyphPaths(glyphs, startX, startY, scale);
  let labelSvg = '';
  if (label !== '') {
    const labelHeight = box.height * LABEL_BAND_RATIO;
    // Only capitals are drawn: "1.0.0-rc.1" shows as "1.0.0-RC.1".
    const text = layoutText(label.toUpperCase());
    const labelScale = Math.min(
      (box.height * TEXT_HEIGHT_RATIO * 0.7) / GLYPH_HEIGHT,
      (box.width * LABEL_MAX_WIDTH_RATIO) / text.width,
    );
    const labelX = box.x + (box.width - text.width * labelScale) / 2;
    const labelY = box.y + (labelHeight - GLYPH_HEIGHT * labelScale) / 2;
    labelSvg =
      `<g clip-path="url(#clip)"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${labelHeight}" fill="${LABEL_COLOR}" fill-opacity="0.85"/></g>` +
      `<g fill="none" stroke="#FFFFFF" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">${glyphPaths(text.glyphs, labelX, labelY, labelScale)}</g>`;
  }
  // Strokes are scaled together with each glyph, so the stroke width is expressed in glyph units.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
      `<defs><clipPath id="clip"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${clipRadius}"/></clipPath></defs>` +
      `<g clip-path="url(#clip)"><rect x="${box.x}" y="${bandY}" width="${box.width}" height="${bandHeight}" fill="${badge.color}"/></g>` +
      `<g fill="none" stroke="#FFFFFF" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
      labelSvg +
      `</svg>`,
  );
}

const PNG_OPTIONS = { compressionLevel: 9, adaptiveFiltering: false };

/**
 * Returns the source image with the environment ribbon (and the label, when given) composited on
 * top. Prod has no badge, so it is never labelled.
 */
export async function withBadge(file, box, badge, clipRadius, label = '') {
  const input = path.join(sourceDir, file);
  if (!badge) {
    return sharp(input).png(PNG_OPTIONS).toBuffer();
  }
  const { width } = await sharp(input).metadata();
  return sharp(input)
    .composite([{ input: ribbonSvg(width, box, badge, clipRadius, label) }])
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

async function generateAndroid({ flavor, badge }, label) {
  const res = path.join(root, 'android/app/src', flavor, 'res');
  // Legacy icon: the ribbon spans the full-bleed square. Foreground: the ribbon sits on the 288px tile.
  const legacy = await withBadge(
    'app-icon.png',
    { x: 0, y: 0, width: 1024, height: 1024 },
    badge,
    0,
    label,
  );
  const foreground = await withBadge(
    'app-icon-foreground.png',
    { x: 72, y: 72, width: 288, height: 288 },
    badge,
    48,
    label,
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

async function generateIos({ iosSet, badge }, label) {
  const dir = path.join(root, 'ios', iosApp, 'Images.xcassets', `${iosSet}.appiconset`);
  const icon = await withBadge(
    'app-icon.png',
    { x: 0, y: 0, width: 1024, height: 1024 },
    badge,
    0,
    label,
  );
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
    if (entry.startsWith('mipmap-')) {
      await rm(path.join(mainRes, entry), { recursive: true, force: true });
    }
  }
}

/** Reads `--label <text>` and `--env <name>`; both are optional. */
export function parseArgs(argv) {
  const options = { label: '', env: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== '--label' && flag !== '--env') {
      throw new Error(`icons.mjs: unknown option "${flag}" (use --label <text> or --env <name>)`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`icons.mjs: ${flag} needs a value`);
    }
    options[flag.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function main() {
  const { label, env } = parseArgs(process.argv.slice(2));
  const selected = env === undefined ? ENVIRONMENTS : ENVIRONMENTS.filter((e) => e.flavor === env);
  if (selected.length === 0) {
    throw new Error(`icons.mjs: unknown env "${env}"`);
  }
  await removeStockAndroidIcons();
  for (const environment of selected) {
    await generateAndroid(environment, label);
    await generateIos(environment, label);
  }
  const suffix =
    label === '' ? '' : ` with label "${label}" (envs without a badge are never labelled)`;
  console.log(`Generated icons for: ${selected.map((e) => e.flavor).join(', ')}${suffix}`);
}

// Run only as a script, so tests can import the helpers above.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
