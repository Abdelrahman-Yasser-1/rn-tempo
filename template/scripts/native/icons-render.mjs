// Each SVG uses a solid background rectangle and a mark above it. Omit that rectangle for
// Android's independently moving foreground layer.
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

const sourceDir = fileURLToPath(new URL('../../src/assets/icons-source/', import.meta.url));

export async function renderSources(inputDir = path.join(sourceDir, 'svg'), outputDir = sourceDir) {
  await mkdir(outputDir, { recursive: true });
  // @tempo-feature:app-icons:start
  const layers = path.join(outputDir, 'alternates/foreground');
  await mkdir(layers, { recursive: true });
  const previews = path.join(outputDir, 'previews');
  await mkdir(previews, { recursive: true });
  // @tempo-feature:app-icons:end
  for (const file of (await readdir(inputDir)).filter((name) => name.endsWith('.svg')).sort()) {
    const svg = await readFile(path.join(inputDir, file), 'utf8');
    const foreground = svg.replace(/<rect\b[^>]*\sid="background"[^>]*\/>/, '');
    if (foreground === svg) {
      throw new Error(`${file} needs a background rect with id="background"`);
    }
    const outputs = { flat: 'app-icon.png', layer: 'app-icon-foreground.png' };
    // @tempo-feature:app-icons:start
    const name = path.basename(file, '.svg');
    if (name !== 'default') {
      outputs.flat = `alternates/${name}.png`;
      outputs.layer = `alternates/foreground/${name}.png`;
    }
    // @tempo-feature:app-icons:end
    await sharp(Buffer.from(svg))
      .resize(1024, 1024)
      .removeAlpha()
      .png()
      .toFile(path.join(outputDir, outputs.flat));
    // @tempo-feature:app-icons:start
    await sharp(Buffer.from(svg))
      .resize(96, 96)
      .removeAlpha()
      .png()
      .toFile(path.join(previews, name + '.png'));
    // @tempo-feature:app-icons:end
    // Inset the mark into the adaptive canvas so the lower ribbon clears the stem.
    const mark = await sharp(Buffer.from(foreground)).resize(360, 360).png().toBuffer();
    await sharp(mark)
      .extend({ top: 32, bottom: 40, left: 36, right: 36, background: '#00000000' })
      .png()
      .toFile(path.join(outputDir, outputs.layer));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await renderSources();
}
