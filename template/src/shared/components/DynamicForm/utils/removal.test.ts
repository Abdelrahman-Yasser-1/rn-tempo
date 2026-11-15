import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../..');
const MODULE = 'dynamic-forms';
const MANIFEST = path.join(ROOT, '.tempo', 'features', `${MODULE}.json`);
/** Names that only the module's own files use; anything else mentioning them must sit in a marker. */
const REFERENCES = new RegExp(
  ['dynamic-forms', 'DynamicForm', 'formsDraft', 'initFormDrafts', 'FormBuilder', 'FormFlow'].join(
    '|',
  ),
);

type Manifest = {
  deleteGlobs: string[];
  jsonPatches: { file: string; op: string; path: string }[];
};

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

/** The same glob dialect as the CLI: `**`, `*`, `?` and `{a,b}`; `dir/**` also matches `dir`. */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .replaceAll(/[.+^$()|[\]\\]/g, '\\$&')
    .replaceAll('**/', '\u0000')
    .replaceAll('**', '\u0001')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0001', '.*')
    .replaceAll('\u0000', '(?:.*/)?')
    .replaceAll('?', '[^/]')
    .replaceAll('{', '(?:')
    .replaceAll('}', ')')
    .replaceAll(',', '|');
  return new RegExp(`^${source}$`);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const relative = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

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
  const allFiles = filesUnder(path.join(ROOT, 'src')).map(relative);
  const manifest = readManifest();
  const owns = (file: string) => manifest.deleteGlobs.some((glob) => globToRegExp(glob).test(file));

  it('AC-10: the manifest owns the module files, its locales and its spec', () => {
    for (const file of [
      'src/shared/components/DynamicForm/index.ts',
      'src/shared/components/DynamicForm/components/FormBuilder/FormBuilder.tsx',
      'src/shared/components/DynamicForm/hooks/useBuilderForm.ts',
      'src/shared/components/DynamicForm/utils/fromJson.ts',
      'src/shared/components/DynamicForm/drafts/drafts.ts',
      'src/shared/components/DynamicForm/screens/DynamicFormFlowScreen/DynamicFormFlowScreen.tsx',
      'src/shared/components/DynamicForm/flows/demoJsonFlow.ts',
      'src/app/bootstrap/initFormDrafts.ts',
      'specs/dynamic-forms/spec.md',
    ]) {
      expect({ file, isOwned: owns(file) }).toEqual({ file, isOwned: true });
    }
  });

  it('AC-10: the manifest does not own files that other code needs', () => {
    for (const file of [
      'src/shared/utils/format.ts',
      'src/shared/utils/index.ts',
      'src/shared/components/index.ts',
      'src/shared/components/FormReview/FormReview.tsx',
      'src/shared/components/FormTextField/FormTextField.tsx',
      'src/shared/hooks/useLatest.ts',
      'src/services/storage/keys.ts',
      'src/app/bootstrap/securityStore.ts',
    ]) {
      expect({ file, isOwned: owns(file) }).toEqual({ file, isOwned: false });
    }
  });

  it('AC-10: every glob of the manifest matches a file that exists', () => {
    const everything = [...allFiles, ...filesUnder(path.join(ROOT, 'specs')).map(relative)];
    for (const glob of manifest.deleteGlobs) {
      const pattern = globToRegExp(glob);
      expect({ glob, matches: everything.some((file) => pattern.test(file)) }).toEqual({
        glob,
        matches: true,
      });
    }
  });

  it('AC-10: every JSON patch removes a key that exists', () => {
    for (const patch of manifest.jsonPatches) {
      const file = path.join(ROOT, patch.file);
      expect(existsSync(file)).toBe(true);
      let node: unknown = JSON.parse(readFileSync(file, 'utf8'));
      for (const key of patch.path.split('/').slice(1)) {
        expect(node).toHaveProperty([key]);
        node = (node as Record<string, unknown>)[key];
      }
    }
  });

  it('AC-10: no file outside the module mentions it except inside its markers', () => {
    const offenders = allFiles
      .filter((file) => /\.tsx?$/.test(file) && !owns(file))
      .flatMap((file) =>
        unmarkedReferences(path.join(ROOT, file)).map((line) => `${file}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
