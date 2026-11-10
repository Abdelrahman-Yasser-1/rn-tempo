import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const FEATURE_DIR = path.join(ROOT, 'src/features/dynamic-forms');
const REFERENCES = /@features\/dynamic-forms|DynamicFormFlow|formsDraft|dynamic-forms|forms\.json/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (full === FEATURE_DIR) {
      return [];
    }
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** Lines of a file that mention the module and sit outside a `dynamic-forms` marker. */
function unmarkedReferences(file: string): string[] {
  let isInside = false;
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => {
      if (line.includes('@tempo-feature:dynamic-forms:start')) {
        isInside = true;
        return false;
      }
      if (line.includes('@tempo-feature:dynamic-forms:end')) {
        isInside = false;
        return false;
      }
      const isMarked = isInside || line.includes('@tempo-feature:dynamic-forms');
      return !isMarked && REFERENCES.test(line);
    });
}

describe('removing the dynamic-forms module', () => {
  it('AC-10: the manifest deletes the feature folder, its locales and its spec', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, '.tempo/features/dynamic-forms.json'), 'utf8'),
    ) as { deleteGlobs: string[] };
    expect(manifest.deleteGlobs).toEqual(
      expect.arrayContaining([
        'src/features/dynamic-forms/**',
        'src/locales/*/forms.json',
        'specs/dynamic-forms/**',
      ]),
    );
  });

  it('AC-10: no file outside the module mentions it except inside its markers', () => {
    const offenders = filesUnder(path.join(ROOT, 'src'))
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) =>
        unmarkedReferences(file).map((line) => `${path.relative(ROOT, file)}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
