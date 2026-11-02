# create-tempo-app

The RN-TEMPO command line: `create-tempo-app` scaffolds a project from the template, and `tempo` manages it afterwards (generators, environments, icons, feature add/remove, cleanup and health checks).

```sh
npx create-tempo-app MyApp          # interactive
npx create-tempo-app MyApp --yes    # defaults, no prompts
yarn tempo --help
```

Every command accepts `--yes` (defaults, no prompts), `--json` (machine output on stdout, logs on stderr) and `--cwd <dir>`.

## Modules

```sh
yarn tempo feature list
yarn tempo feature remove samples
yarn tempo feature add samples [--dry-run] [--force] [--template <path|gh:...>] [--json]
```

`feature add` fetches the template of the `templateVersion` in `.tempo.json`, renames it like your
project and restores the module: its files, the `@tempo-feature` regions in shared files, dependencies
(pinned like the template), env keys and package.json scripts. It never overwrites existing files
(use `--force`) and never guesses: a region whose position is ambiguous is listed as a conflict and
printed for a manual merge. `--dry-run` lists the changes without writing. `--json` prints
`{ ok, feature, added, updated, conflicts, followUps }`. Run `yarn install` (and pods) afterwards.

`tempo g ... --dry-run` also previews the barrel, locale, i18n and route updates; `--json` lists them
in `updated`, and `--register` adds a kebab-case deep link to `src/navigation/linking.ts`.

This package is written in TypeScript (`src/`) and built with tsdown into `dist/`.
