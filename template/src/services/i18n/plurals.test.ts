import { i18n, initI18nInstance } from './i18n';
import { LANGUAGES, type Language } from './languages';
import { resources } from './resources';

const COUNTS = [0, 1, 2, 3, 11, 100] as const;
const ARABIC_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

const EXPECTED = {
  en: ['0 items', '1 item', '2 items', '3 items', '11 items', '100 items'],
  ar: ['لا توجد عناصر', 'عنصر واحد', 'عنصران', '3 عناصر', '11 عنصرًا', '100 عنصر'],
} as const;

describe('plural forms', () => {
  afterEach(async () => {
    await initI18nInstance('en');
  });

  test('AC-N-2: Arabic items.list.count has all six plural forms', () => {
    const keys = Object.keys(resources.ar.items.list);

    for (const form of ARABIC_FORMS) {
      expect(keys).toContain(`count_${form}`);
    }
    expect(Object.keys(resources.en.items.list)).toEqual(
      expect.arrayContaining(['count_one', 'count_other']),
    );
  });

  test.each(['en', 'ar'] as const)('AC-N-2: counts 0, 1, 2, 3, 11 and 100 in %s', async (lng) => {
    await initI18nInstance(lng);

    const rendered = COUNTS.map((count) => i18n.t('list.count', { ns: 'items', count }));

    expect(rendered).toEqual(EXPECTED[lng]);
  });

  // The forms each language needs come from the runtime's CLDR data, the same source i18next uses.
  const formsOf = (lng: Language) => new Intl.PluralRules(lng).resolvedOptions().pluralCategories;

  test.each(LANGUAGES.map(({ code }) => code))(
    'AC-L-2: %s items.list.count has exactly the plural forms CLDR defines',
    (lng) => {
      const keys = Object.keys(resources[lng].items.list).filter((key) => key.startsWith('count_'));

      expect(new Set(keys)).toEqual(new Set(formsOf(lng).map((form) => `count_${form}`)));
    },
  );

  test.each(LANGUAGES.map(({ code }) => code))(
    'AC-L-2: %s resolves every count to the form Intl.PluralRules picks',
    async (lng) => {
      await initI18nInstance(lng);

      for (const count of [0, 1, 2, 3, 5, 11, 21, 100, 1000000]) {
        const form = new Intl.PluralRules(lng).select(count);
        const expected = (resources[lng].items.list as Record<string, string>)[
          `count_${form}`
        ]?.replace('{{count, number}}', new Intl.NumberFormat(lng).format(count));

        expect(i18n.t('list.count', { ns: 'items', count })).toBe(expected);
      }
    },
  );

  test('AC-L-2: es and de pick one for 1 and other for everything small', async () => {
    await initI18nInstance('es');
    expect(i18n.t('list.count', { ns: 'items', count: 1 })).toBe('1 artículo');
    expect(i18n.t('list.count', { ns: 'items', count: 0 })).toBe('0 artículos');
    expect(i18n.t('list.count', { ns: 'items', count: 11 })).toBe('11 artículos');

    await initI18nInstance('de');
    expect(i18n.t('list.count', { ns: 'items', count: 1 })).toBe('1 Artikel');
    expect(i18n.t('list.count', { ns: 'items', count: 0 })).toBe('0 Artikel');
    expect(i18n.t('list.count', { ns: 'items', count: 2 })).toBe('2 Artikel');
  });

  test('AC-L-2: fr treats 0 and 1 as one, and uses many for round millions', async () => {
    await initI18nInstance('fr');

    expect(i18n.t('list.count', { ns: 'items', count: 0 })).toBe('0 article');
    expect(i18n.t('list.count', { ns: 'items', count: 1 })).toBe('1 article');
    expect(i18n.t('list.count', { ns: 'items', count: 2 })).toBe('2 articles');
    expect(i18n.t('list.count', { ns: 'items', count: 1000000 })).toMatch(/ d'articles$/);
  });
});
