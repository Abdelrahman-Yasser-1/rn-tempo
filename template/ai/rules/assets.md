---
description: Icons and images. Sources in src/assets, generated components, every Tabler icon in src, adding icons, pruning at release, RTL mirroring.
globs: src/assets/**,src/shared/components/Icon/**,scripts/assets.mjs,scripts/icons-add.mjs,scripts/icons-prune.mjs
---

# Assets and icons

Icon SVGs are committed in `src/assets/icons/` (flat, kebab-case, one color). The whole Tabler set ships there (about 1,860 icons; filled ones end in `-filled`), so **every icon name autocompletes** in `<Icon name="..." />`. `yarn assets` validates the SVGs and generates `src/assets/generated/` (one react-native-svg component per icon, `ICONS`, the `IconName` union, `ICON_MIRRORED_IN_RTL`). Never edit `generated/`; commit it with the source. `yarn assets:check` fails when it is stale and runs in the pre-commit hook. `yarn start` runs `yarn assets` first.

Release builds are pruned: `yarn icons:prune` regenerates `generated/` with only the icons the code names, so the bundle does not carry the other ~1,800. Dev and debug builds are never pruned.

## Add an icon

Every Tabler icon is already in `src/assets/icons/`: find it, then use it. To add your own or a newer Tabler icon:

```sh
yarn icons:search arrow            # find a local name (add --remote for Tabler icons you can fetch)
yarn icons:add ./my-icon.svg       # copy a file in (normalized, kebab-case) and regenerate
yarn icons:add heart-plus --filled # fetch a Tabler icon (3.50.0, needs network) -> heart-plus-filled.svg
yarn icons:add ./x.svg --as close  # choose the name
```

Or save `my-icon.svg` into `src/assets/icons/` and run `yarn assets` (`yarn assets --watch` regenerates on every change). The new name is in the `IconName` autocomplete right away. Do not hand-draw SVGs: use a single-color 24x24 `currentColor` file.

## Prune at release

- An icon is kept when its name is a string literal (`'home'`, `"home"`, `` `home` ``) in `src/**/*.{ts,tsx}` (tests, stories and `generated/` do not count). A typed constant or a map of names therefore keeps its icons.
- A name built at runtime (`` `flag-${code}` ``) must be listed in `ICON_KEEP` in `src/assets/icons.keep.ts`.
- `Icon` renders nothing for a name missing from a pruned registry (and warns in development, where nothing is pruned).
- Fastlane build lanes, the `android:*:release`, `android:*:bundle` and `ios:*:release` scripts, and the CI build workflows run `yarn icons:prune` before building. `yarn icons:prune --restore` (or `yarn assets`) brings every icon back; never commit a pruned `generated/`.

## Use an icon

- Only through `<Icon name="..." />` from `@shared/components`. Importing `*.svg` or `react-native-svg` elsewhere is a lint error.
- `size` is a token (`xs` 12, `sm` 16, `md` 20, `lg` 24, `xl` 32) or a number. `color` is a semantic color token, never a hex value.
- Icons are decorative (hidden from screen readers) unless `accessibilityLabel` is given. A control that holds only an icon needs a translated label.
- Directional icons flip in RTL on their own: `Icon` mirrors every name in `ICON_MIRRORED_IN_RTL` (`src/assets/generated/icons.rtl.ts`). **Never** flip an icon by hand (`scaleX`, picking `chevron-left` vs `chevron-right` by direction). The list is generated from the names: arrows, chevrons, carets and corners that point left or right (not `up` or `down`), plus `login`, `logout`, `send`, `reply`, `forward`, `undo` and `redo`. Name a new directional icon the same way and it flips on its own.

## Rules `yarn assets` enforces

`viewBox` present, one paint color (forced to `currentColor`), no `<style>`, `<script>`, `<foreignObject>`, filters or animation, no duplicate content or names, no density suffix on icons, no stray files or folders in `src/assets`. Images are PNG with `name.png`, `name@2x.png` and `name@3x.png`.
