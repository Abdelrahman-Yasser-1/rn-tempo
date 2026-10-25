---
name: add-env
description: Add an environment variable or a whole new app environment. Use when the user needs a new config value or a new env such as qa.
---

# add-env

## New variable

1. Add it to the Zod schema in `src/config/env.ts` (with a default if optional) and to `.env.example`, `.env.dev`, and document values for `.env.staging` / `.env.prod`.
2. Read it through `ENV` from `@config/env`; never import `react-native-config` elsewhere.
3. Never commit secrets: `.env.dev` is committed and secret-free; CI writes `.env.staging` and `.env.prod` from the `ENV_FILE_STAGING` and `ENV_FILE_PROD` secrets (add the new key there).
4. Add a test for validation if the rule is non-trivial. Run `yarn verify:changed`. Commit: `feat(env): add <KEY> variable`.

## New environment

Use `yarn tempo env add <name>` when the CLI is installed (Gradle flavor, Xcode config and scheme via `yarn ios:envs`, `.env.<name>`, scripts, `.tempo.json`). If it is not installed, stop and ask: native flavor changes must not be hand-edited. Commit native changes separately.
