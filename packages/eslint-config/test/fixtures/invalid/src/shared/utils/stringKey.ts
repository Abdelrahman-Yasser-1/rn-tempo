declare function t(key: string | ((source: Record<string, string>) => string)): string;
declare const i18n: { t: (key: string | ((source: Record<string, string>) => string)) => string };

/** String keys: the first, second and third are reported; the selector form is fine. */
export function titles() {
  return [t('login.title'), i18n.t('login.title'), t(`login.title`), t(($) => $.login)];
}
