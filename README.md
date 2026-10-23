# RN-TEMPO

An opinionated, enforced and AI-ready baseline for React Native CLI apps. Every project created from it shares the same structure, tooling and conventions, so people and AI agents can move between projects and only learn what is specific to each one.

## What's in this repo

| Path | What it is |
| --- | --- |
| `template/` | The React Native app that new projects are created from (runnable on its own) |
| `packages/cli` | `create-tempo-app` and the `tempo` CLI (generators, envs, icons, doctor, upgrade) |
| `packages/*-config` | Shared ESLint, Prettier, commitlint and TypeScript configs, published to npm |
| `packages/contracts` | JSON schemas shared by the CLI, the template and CI |
| `docs/` | Documentation site (Fumadocs) |
| `specs/` | Specs and the implementation plan for building this repo |

## Getting started

```sh
nvm use          # Node 24 LTS
corepack enable  # Yarn 4
yarn install
```

See `specs/PLAN.md` for the full plan and `AGENTS.md` for contributor and AI-agent rules.

## License

MIT
