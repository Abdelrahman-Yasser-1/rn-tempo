type Selector = (keys: Record<string, string>) => string;
declare function t(key: string | Selector): string;
declare const i18n: { t: (key: string | Selector) => string };

/** Selector-form keys: the first and third are reported. */
export function closeLabels() {
  return [t(($) => $.close ?? ''), t('actions.close'), i18n.t(($) => $.close ?? '')];
}
