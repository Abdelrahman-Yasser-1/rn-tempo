# @rn-tempo/tsconfig

Shared TypeScript presets for RN-TEMPO projects.

- `base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`
- `react-native.json`: extends `@react-native/typescript-config` plus `base.json`

## Usage

```jsonc
// tsconfig.json
{
  "extends": "@rn-tempo/tsconfig/react-native.json",
  "compilerOptions": { "paths": { "@app/*": ["./src/app/*"] } }
}
```

`paths` is resolved relative to the project's `tsconfig.json`, so each project keeps its own alias list.
