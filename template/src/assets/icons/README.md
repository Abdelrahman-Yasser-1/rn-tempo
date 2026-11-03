# Icons

The [Tabler Icons](https://tabler.io/icons) set (MIT, see `LICENSE`), version 3.50.0, 24x24, drawn in `currentColor`. Outline icons keep their name (`arrow-left.svg`); filled ones end in `-filled` (`arrow-left-filled.svg`). Every file here becomes an `<Icon name="..." />` after `yarn assets`.

Add your own: save a single-color SVG here and run `yarn assets`, or run `yarn icons:add <path-or-tabler-name>`. See `../README.md`.

The 20 icons the template uses keep the names they had under Lucide (`close`, `globe`, `info`, ...), so Tabler's `x`, `world` and `info-circle` are not duplicated. The set comes from the GoMoney icon collection with its metadata comments and invisible bounding-box path removed; its outline half was incomplete, so outline icons beyond `brand-kbin` are missing and can be fetched with `yarn icons:add <name>`.

## Trademarks

The `brand-*` icons depict third-party brands. The logos are trademarks of their owners. Use them only as that brand's own logo permits.
