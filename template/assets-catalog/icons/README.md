# Icon catalogue

A browsable set of SVG icons. **Nothing here is bundled into the app.** Nothing under `src/` may import from this folder (an ESLint rule enforces it). An icon is only part of the app once it is copied into `src/assets/icons/`:

```sh
yarn icons:search arrow      # list matching catalogue names
yarn icons:add arrow-left    # copy an outline icon and regenerate
yarn icons:add heart --filled
yarn icons:add x --as close  # keep your own name
```

## Source

[Tabler Icons](https://tabler.io/icons) (MIT, see `LICENSE`), taken from the GoMoney icon set. All icons are 24x24 and use `currentColor`. The metadata comments and the invisible bounding-box path were stripped.

| Folder     | Icons |
| ---------- | ----- |
| `outline/` | 812   |
| `filled/`  | 1053  |

The GoMoney outline set is incomplete (it ends at `brand-kbin`, and the 0-byte `brand-kbin.svg` is skipped). The 19 outline icons the template itself uses (`check`, `chevron-left`, `home`, `world`, ...) were added from the `@tabler/icons` 3.50.0 package in the same cleaned format. Add more the same way when you need them.

## Trademarks

The `brand-*` icons depict third-party brands. The logos are trademarks of their owners. Use them only as that brand's own logo permits.
