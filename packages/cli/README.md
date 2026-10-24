# create-tempo-app

The RN-TEMPO command line: `create-tempo-app` scaffolds a project from the template, and `tempo` manages it afterwards (generators, environments, icons, feature removal, cleanup and health checks).

```sh
npx create-tempo-app MyApp          # interactive
npx create-tempo-app MyApp --yes    # defaults, no prompts
yarn tempo --help
```

Every command accepts `--yes` (defaults, no prompts), `--json` (machine output on stdout, logs on stderr) and `--cwd <dir>`.

This package is written in TypeScript (`src/`) and built with tsdown into `dist/`.
