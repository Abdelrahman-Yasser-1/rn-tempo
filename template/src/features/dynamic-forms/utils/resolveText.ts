import type { FormText } from '@features/dynamic-forms/types';

/** The part of i18next's `t` this module needs; keys are checked at the config, not here. */
export type TranslateText = (key: string) => string;

/**
 * Turns a label reference into text: `{ en, ar }` objects follow the active language (`ar`, else
 * `en`), strings are keys of the `forms` namespace or `ns:key` and go through `t`.
 */
export function resolveText(
  translate: TranslateText,
  language: string,
  text: FormText | undefined,
): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  if (typeof text === 'string') {
    return translate(text);
  }
  return language.startsWith('ar') ? text.ar : text.en;
}
