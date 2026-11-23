# Translation status

English (`en`) is the source language. Arabic (`ar`) is maintained with the template. Spanish, German and French were machine-drafted and need a native speaker to review them before a release that ships those languages.

## Status per language

| Language | Code | Status                     | Reviewer | Date |
| -------- | ---- | -------------------------- | -------- | ---- |
| English  | en   | source                     |          |      |
| Arabic   | ar   | reviewed with the template |          |      |
| Spanish  | es   | draft (machine)            |          |      |
| German   | de   | draft (machine)            |          |      |
| French   | fr   | draft (machine)            |          |      |

## Signing off a language

1. A native speaker reads every file in `src/locales/<code>/` against `src/locales/en/` (tone, terminology, plural forms, text length in tight layouts such as buttons and tabs).
2. They fix wording directly in the JSON files. Keep `{{placeholders}}`, formatter options such as `{{count, number}}` and plural suffixes (`_one`, `_many`, `_other`) exactly as they are.
3. Run `yarn i18n:check` from `template/`. It must pass.
4. Change the language's Status to `reviewed`, write the reviewer's name and the date, and commit this file with the fixes.

When a feature adds or changes strings, update the new keys in every language and set the language back to `draft (machine)` until the new keys are reviewed.
