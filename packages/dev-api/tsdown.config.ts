import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { defineConfig } from 'tsdown';

const swagger = dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

// `tempo-api` keeps its shebang; `index` is the programmatic entry (createServer, generate); `runtime` is the
// entry with no Node imports, for Jest and the app.
//
// The second build is the standalone one for the desktop app: one file with every dependency inlined, so
// `node tempo-api.mjs up --cwd <project>` works with no node_modules. The Swagger UI files it serves are
// copied next to it (`swagger-ui/`) and found relative to the bundle. `clean` is off for both because the
// `build` script empties `dist` once; two configs that each cleaned would delete each other's output.
export default defineConfig([
  {
    entry: { 'tempo-api': 'src/bin.ts', index: 'src/index.ts', runtime: 'src/runtime/index.ts' },
    format: 'esm',
    platform: 'node',
    target: 'node22',
    clean: false,
    dts: true,
  },
  {
    entry: { 'tempo-api': 'src/bin.ts' },
    outDir: 'dist/standalone',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    clean: false,
    dts: false,
    // `alwaysBundle` is the current name of what older versions called `noExternal`.
    deps: { alwaysBundle: [/.*/], onlyBundle: false },
    plugins: [
      {
        // jiti loads its TypeScript transform (`dist/babel.cjs`) with a `require` relative to its own file,
        // which no longer exists once jiti is inlined. A static import lets the bundler inline it too.
        name: 'jiti-babel',
        transform(code: string, id: string) {
          if (!id.endsWith('node_modules/jiti/lib/jiti.mjs')) return null;
          const patched = code
            .replace('_transform = createRequire(import.meta.url)("../dist/babel.cjs");', '_transform = babelTransform;')
            .replace('import _createJiti', 'import babelTransform from "../dist/babel.cjs";\nimport _createJiti');
          return patched === code ? null : { code: patched, map: null };
        },
      },
      {
        // qrcode-terminal is sloppy-mode CommonJS with `"\033[40m"` octal escapes, which the bundler's
        // strict parser rejects. `\x1b` is the same character.
        name: 'octal-escapes',
        transform(code: string, id: string) {
          return id.includes('qrcode-terminal') ? { code: code.replaceAll('\\033', '\\x1b'), map: null } : null;
        },
      },
    ],
    copy: ['swagger-ui.css', 'swagger-ui-bundle.js', 'favicon-16x16.png', 'favicon-32x32.png'].map((file) => ({
      from: join(swagger, file),
      to: 'dist/standalone/swagger-ui',
    })),
  },
]);
