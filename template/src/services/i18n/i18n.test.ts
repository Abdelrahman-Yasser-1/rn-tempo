import { i18n, initI18nInstance } from './i18n';
import { resources } from './resources';

describe('i18n resources', () => {
  test('en and ar expose the same namespaces and key sets', () => {
    const keys = (value: object): string[] =>
      (Object.entries(value) as [string, unknown][]).flatMap(([key, child]) =>
        typeof child === 'object' && child !== null
          ? keys(child).map((sub) => `${key}.${sub}`)
          : [key],
      );

    expect(Object.keys(resources.ar)).toEqual(Object.keys(resources.en));
    for (const namespace of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
      expect(keys(resources.ar[namespace])).toEqual(keys(resources.en[namespace]));
    }
  });

  test('includes every contract C11 namespace, including forms', () => {
    const namespaces = Object.keys(resources.en);

    expect(namespaces).toHaveLength(10);
    expect(namespaces).toEqual(
      expect.arrayContaining([
        'app',
        'auth',
        'common',
        'errors',
        'forms',
        'home',
        'items',
        'profile',
        'settings',
        'validation',
      ]),
    );
  });

  test('translates, falls back to en and switches language', async () => {
    // Namespaces are empty until feature code references keys (the extractor prunes unused ones).
    const translate = i18n.t as (key: string, options?: object) => string;
    await initI18nInstance('ar');
    i18n.addResource('en', 'common', 'hello', 'Hello');
    i18n.addResource('ar', 'errors', 'network', 'لا يوجد اتصال');

    expect(translate('hello')).toBe('Hello');
    expect(translate('network', { ns: 'errors' })).toBe('لا يوجد اتصال');

    await initI18nInstance('en');
    expect(i18n.language).toBe('en');
  });
});
