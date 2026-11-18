import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The workspace schema is the dev API's own Zod schema (one source of truth). The file imports only
// `zod`, so the browser bundle takes it straight from the package source.
const workspaceSchema = fileURLToPath(
  new URL('../../../packages/dev-api/src/workspace/schema.ts', import.meta.url),
);

// Tauri expects a fixed dev port and must not watch its own Rust output.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@dev-api/workspace-schema': workspaceSchema } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1', watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'safari16', outDir: 'dist', emptyOutDir: true },
});
