import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `monaco-editor` exports every file as `<name>.js`, so its stylesheets and the font cannot be imported by package name.
// `monaco-vs/...` points at the same folder (`esm/vs`) for them.
const monacoVs = dirname(dirname(createRequire(import.meta.url).resolve('monaco-editor/editor/editor.api')));


// Tauri expects a fixed dev port and must not watch its own Rust output.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'monaco-vs': monacoVs } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1', watch: { ignored: ['**/src-tauri/**'] } },
  // Monaco's workers are ES modules (they split their own code), loaded from the same origin as the page.
  worker: { format: 'es' },
  build: { target: 'safari16', outDir: 'dist', emptyOutDir: true },
});
