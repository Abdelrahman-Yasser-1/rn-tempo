import { i18n, initI18nInstance } from './i18n';
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

    const rendered = COUNTS.map((count) => i18n.t(($) => $.list.count, { ns: 'items', count }));

    expect(rendered).toEqual(EXPECTED[lng]);
  });
});
