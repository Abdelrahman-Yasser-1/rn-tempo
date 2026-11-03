# Assets (`src/assets`)

| Folder          | Holds                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| `icons/`        | Single-color SVG sources, flat, kebab-case (`arrow-left.svg`)                 |
| `images/`       | PNG at 1x, 2x and 3x (`logo.png`, `logo@2x.png`, `logo@3x.png`)               |
| `fonts/`        | Font files, linked natively by `yarn fonts:link`                              |
| `animations/`   | Lottie files, imported directly                                               |
| `icons-source/` | Source artwork for the native app icons (`yarn icons`)                        |
| `generated/`    | Built by `yarn assets`. Never edit it; commit it with the source it came from |

## Add an icon

```sh
yarn icons:search arrow      # find a name in the catalogue
yarn icons:add arrow-left    # copy it into icons/ and regenerate
```

Options: `--filled` for the filled style (the file becomes `arrow-left-filled.svg`), `--as <name>` to rename (`yarn icons:add x --as close`). The catalogue is `assets-catalog/icons/{outline,filled}` (Tabler Icons, MIT, license in `assets-catalog/icons/LICENSE`). It is **not bundled**: only icons in `src/assets/icons/` ship, and nothing may import from `assets-catalog`.

Then use it through the component, never by importing the file:

```tsx
<Icon name="arrow-left" size="md" color="textSecondary" />
```

Add directional icons (`arrow-left`, `arrow-right`, ...) to `ICON_MIRRORED_IN_RTL` in `src/shared/components/Icon/useIcon.ts` so they flip in right-to-left layouts.

## `yarn assets`

Validates the sources, then writes `generated/`: one react-native-svg component per icon (through `@svgr/cli`, no fixed width or height), `icons.registry.ts` (`ICONS`), `icons.types.ts` (`IconName`), and for images `images.registry.ts` (`IMAGES`) and `images.types.ts` (`ImageName`). Icons are drawn in `currentColor`, so `Icon` tints them. It fails on:

- a name that is not kebab-case, a name used twice, or the same file twice;
- a density suffix on an icon, a stray file, or an unknown folder;
- an SVG without a `viewBox`, with `<style>`, `<script>`, `<foreignObject>`, filters or animation, or an icon with more than one color or a gradient;
- an image without its 1x, 2x and 3x files, or not in a 1:2:3 size ratio.

`yarn assets:check` regenerates into a temporary folder and fails when `generated/` differs. The pre-commit hook runs it when `src/assets/**` or `scripts/assets.mjs` is staged.

Multi-color illustrations are not supported yet; add an `illustrations/` registry when a project needs one.
