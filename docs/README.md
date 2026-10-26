# RN Tempo Docs

The Fumadocs (Next.js 16) site for RN-TEMPO. It is a root Yarn workspace named `docs`.

## Develop

From the repo root:

```bash
yarn install
yarn workspace docs dev      # http://localhost:3000
yarn workspace docs build    # production build (fails on a missing code file or region)
yarn workspace docs test     # vitest
```

Content lives in `docs/content/docs`. Every folder has a `meta.json` (title, page order) and an `index.mdx`.

## Deploy on Vercel

The owner connects the Vercel project; nothing in this repo creates one.

- Root directory: `docs`
- Install command: `yarn install --immutable` (run at the repo root)
- Build command: `yarn workspace docs build`
- Enable "Include source files outside of the Root Directory in the Build Step" (the default). `AnnotatedCode` reads real files from the repo (`template/`, `packages/`) at build time, and the build fails when a file or region is missing.
- Optional env var: `NEXT_PUBLIC_SITE_URL` (the public URL, used for Open Graph images).

CI (`.github/workflows/docs.yml`) builds the site on every PR that touches `docs/` or the code it quotes.
