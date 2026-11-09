declare function t(key: string): string;
declare const i18next: { t: (key: string) => string };

/** Template-literal keys: the first and third are reported. */
export function statusLabels(status: string) {
  return [t(`status.${status}`), t('status.fixed'), i18next.t(`status.${status}`)];
}
