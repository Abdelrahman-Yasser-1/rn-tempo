# Architecture decision records

| ADR | Decision |
| --- | --- |
| [001](001-monorepo-layout.md) | One monorepo; `template/` is standalone, not a workspace |
| [002](002-zustand-tanstack-query.md) | Zustand for client state, TanStack Query for server state |
| [003](003-unistyles.md) | Unistyles 3 for styling and theming |
| [004](004-typescript-6.md) | TypeScript 6.0 until typescript-eslint supports 7 |
| [005](005-eslint-10-flat-config.md) | ESLint 10 flat config, no `@react-native/eslint-config` |
| [006](006-maestro.md) | Maestro for E2E |
| [007](007-own-cli-feature-markers.md) | Own CLI with feature markers |
| [008](008-ai-session-tracking.md) | AI session logs and commit trailers |
| [009](009-static-navigation.md) | React Navigation static API |
| [010](010-app-config-endpoint.md) | Remote config endpoint; Firebase as a recipe |
| [011](011-yarn4.md) | Yarn 4, node-modules linker, 24h age gate, `link:` config packages |
| [012](012-no-expo-modules.md) | No Expo modules |
| [013](013-babel-7.md) | Babel 7 until the RN preset supports 8 |

Format: Context · Decision · Consequences · Alternatives. WS6 moves these into `docs/content/docs/adr/`.
