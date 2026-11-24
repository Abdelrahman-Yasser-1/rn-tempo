# What's new

## Purpose

The sample screen of the `cms` module: it lists the `announcement` entries of the content provider in the app language, with a shimmer, empty and error states, pull-to-refresh and infinite scroll. It shows how to read content through `@services/cms` and render it with the shared `Markdown` component.

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `WhatsNewEntry`: The card on Home that opens the screen.
- `WhatsNewScreen`: Paged list of announcements.

## Screens and routes

Route `WhatsNew` of the Home stack (`HomeStackParamList`), deep link `whats-new`. It exists only when the `cms` module is enabled.

## Data

Entries come from `useCmsEntries('announcement')` (`@services/cms`) in the active app language; a field the entry lacks in that language falls back to English on the server. The body is Markdown (a safe subset, see the `Markdown` component). The call-to-action button shows only when both `ctaLabel` and `ctaUrl` are set and the URL is `http`, `https` or `mailto`. Strings are in the `whats-new` namespace.

## Spec

[`specs/ws16-settings-cms/spec.md`](../../../../specs/ws16-settings-cms/spec.md) (AC-C-3, AC-C-4, AC-C-7).
