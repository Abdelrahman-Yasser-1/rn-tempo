# Settings

## Purpose

Language, theme (mode and palette), text size and about screens, plus the hidden debug menu entry (non-production builds).

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `AboutScreen`: Version and build information.
- `AppIconScreen`: Shows the current launcher icon and switches between four bundled designs on supported devices.
- `LanguageScreen`: Switches between `en` and `ar` (a restart is needed when the direction changes).
- `SettingsScreen`: The Settings tab root screen.
- `TextSizeScreen`: Text size (small, default, large or extra large) with a live preview.
- `ThemeScreen`: Mode (light, dark or system) and palette (default, ocean, forest or sunset).

## Screens and routes

Routes of the Settings stack (`SettingsStackParamList`): `Settings`, `Language`, `Theme`, `TextSize`, `AppIcon` and `About`, under the `SettingsTab` tab.

## Data

The app icon selection is read from the operating system on focus through `@services/app-icon`. On Android, the launcher can take a few seconds to update and may remove home-screen shortcuts. Preferences are written through `@services/i18n` (language) and `@theme` (theme), which persist them in MMKV (`app.language`, `app.theme` for the mode, `app.palette`, `app.font-scale` for the text size).

## Spec

[`specs/settings/spec.md`](../../../specs/settings/spec.md), with its [design](../../../specs/settings/design.md) and [tasks](../../../specs/settings/tasks.md).
