# Assets (`src/assets`)

| Folder          | Holds                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| `icons/`        | Single-color SVG sources, flat, kebab-case (`arrow-left.svg`): the Tabler set |
| `images/`       | PNG at 1x, 2x and 3x (`logo.png`, `logo@2x.png`, `logo@3x.png`)               |
| `fonts/`        | Font files, linked natively by `yarn fonts:link`                              |
| `animations/`   | Lottie files, imported directly                                               |
| `icons-source/` | Source artwork for the native app icons (`yarn icons`)                        |
| `generated/`    | Built by `yarn assets`. Never edit it; commit it with the source it came from |

## Icons

The whole [Tabler Icons](https://tabler.io/icons) set (MIT, `icons/LICENSE`) is in `icons/`: about 1,860 files, outline as `arrow-left.svg` and filled as `arrow-left-filled.svg`. `yarn assets` generates a component for every one, so `<Icon name="..." />` autocompletes them all and a new file is in the autocomplete as soon as the generator runs. Use an icon only through the component, never by importing the file:

```tsx
<Icon name="arrow-left" size="md" color="textSecondary" />
```

Find a name with `yarn icons:search arrow`, or browse the `Icon/Gallery` story in Storybook.

### Add an icon

- **Drop a file in.** Save `my-icon.svg` into `icons/` and run `yarn assets`. Keep `yarn assets --watch` running to regenerate on every change (`yarn start` runs `yarn assets` once before Metro).
- **`yarn icons:add <path-or-name> [--as <name>] [--filled]`.** A path to an `.svg` is copied in with a kebab-case name, normalized (comments removed, the one paint color becomes `currentColor`, `width` and `height` dropped when there is a `viewBox`). A bare Tabler name that is not in `icons/` is fetched from `@tabler/icons@3.50.0` with `npm pack` (needs network; offline, add an SVG by path). It then regenerates.
- **`yarn icons:search <term> [--remote]`** lists local names; `--remote` also lists Tabler icons you can fetch.

Names that would make the same content twice are refused: a few Tabler aliases are kept under one name only (`close` rather than `x`, `globe` rather than `world`, `info` rather than `info-circle`), and Tabler's `brightness`/`contrast`, `dice`/`dice-4` and `crop-7-5`/`crop-landscape` filled duplicates are kept once.

### Directional icons

`generated/icons.rtl.ts` lists the icons that flip in right-to-left layouts, built from the names: `arrow`, `arrows`, `chevron`, `chevrons`, `caret` and `corner` icons that point `left` or `right` (names with `up` or `down` stay), and any name with `login`, `logout`, `send`, `reply`, `forward`, `undo` or `redo`. `Icon` flips them, so name a new directional icon the same way.

### Prune at release

`yarn icons:prune` regenerates `generated/` with only the icons that a string literal names in `src/**/*.{ts,tsx}` (tests, stories and `generated/` excluded) plus `ICON_KEEP` in `icons.keep.ts`, for names built at runtime. `IconName` stays whole, so the code still type-checks; `ICONS` becomes a `Partial` record and `Icon` renders nothing for a missing name. `yarn icons:prune --restore` (or `yarn assets`) undoes it. Fastlane build lanes, the `android:*:release`, `android:*:bundle` and `ios:*:release` scripts and the CI build workflows prune before building; dev and debug builds never do.

## `yarn assets`

Validates the sources, then writes `generated/`: one react-native-svg component per icon (through `@svgr/cli`, no fixed width or height), `icons.registry.ts` (`ICONS`), `icons.types.ts` (`IconName`), `icons.rtl.ts` (`ICON_MIRRORED_IN_RTL`), and for images `images.registry.ts` (`IMAGES`) and `images.types.ts` (`ImageName`). Icons are drawn in `currentColor`, so `Icon` tints them. It fails on:

- a name that is not kebab-case, a name used twice, or the same file twice;
- a density suffix on an icon, a stray file, or an unknown folder;
- an SVG without a `viewBox`, with `<style>`, `<script>`, `<foreignObject>`, filters or animation, or an icon with more than one color or a gradient;
- an image without its 1x, 2x and 3x files, or not in a 1:2:3 size ratio.

`yarn assets:check` regenerates into a temporary folder and fails when `generated/` differs. The pre-commit hook runs it when `src/assets/**` or `scripts/assets.mjs` is staged.

Multi-color illustrations are not supported yet; add an `illustrations/` registry when a project needs one.
