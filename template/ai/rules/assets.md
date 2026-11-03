---
description: Icons and images. Sources in src/assets, generated components, the Tabler catalogue, RTL mirroring.
globs: src/assets/**,src/shared/components/Icon/**,scripts/assets.mjs,scripts/icons-add.mjs
---

# Assets and icons

Icon SVGs are committed in `src/assets/icons/` (flat, kebab-case, one color). `yarn assets` validates them and generates `src/assets/generated/` (one react-native-svg component per icon, `ICONS`, and the `IconName` union). Never edit `generated/`; commit it with the source. `yarn assets:check` fails when it is stale and runs in the pre-commit hook.

## Add an icon

```sh
yarn icons:search arrow          # list matching names in the catalogue
yarn icons:add arrow-left        # outline icon -> src/assets/icons/arrow-left.svg, then yarn assets
yarn icons:add heart --filled    # -> heart-filled.svg
yarn icons:add x --as close      # keep your own name
```

The full Tabler catalogue (`assets-catalog/icons/{outline,filled}`) is **never bundled**: only icons copied into `src/assets/icons/` ship. Nothing may import from `assets-catalog` (lint). Do not hand-draw or paste SVGs; if the catalogue lacks the icon, add a single-color 24x24 `currentColor` SVG to `src/assets/icons/` and run `yarn assets`.

## Use an icon

- Only through `<Icon name="..." />` from `@shared/components`. Importing `*.svg` or `react-native-svg` elsewhere is a lint error.
- `size` is a token (`xs` 12, `sm` 16, `md` 20, `lg` 24, `xl` 32) or a number. `color` is a semantic color token, never a hex value.
- Icons are decorative (hidden from screen readers) unless `accessibilityLabel` is given. A control that holds only an icon needs a translated label.
- Directional icons flip in RTL on their own: `Icon` mirrors every name in `ICON_MIRRORED_IN_RTL` (`src/shared/components/Icon/useIcon.ts`). **Never** flip an icon by hand (`scaleX`, picking `chevron-left` vs `chevron-right` by direction). When you add an icon that points somewhere (`arrow-left`, `arrow-right`, ...), add it to that list.

## Rules `yarn assets` enforces

`viewBox` present, one paint color (forced to `currentColor`), no `<style>`, `<script>`, `<foreignObject>`, filters or animation, no duplicate content or names, no density suffix on icons, no stray files or folders in `src/assets`. Images are PNG with `name.png`, `name@2x.png` and `name@3x.png`.
