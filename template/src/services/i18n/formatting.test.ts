import { i18n, initI18nInstance } from './i18n';
import type { Language } from './languageManager';

const LANGUAGES: readonly Language[] = ['en', 'ar'];
const AMOUNT = 1234.5;
const DAY = new Date(2026, 10, 18);

// Sentences the app does not ship, registered to show every built-in formatter in a message.
const SENTENCES = {
  price: 'Total {{amount, currency(USD)}}',
  total: 'Total {{amount, number(minimumFractionDigits: 2)}}',
  day: 'On {{date, datetime(dateStyle: long)}}',
} as const;

const translate = (key: keyof typeof SENTENCES, options: object, lng: Language) =>
  (i18n.t as (key: string, options: object) => string)(key, { ns: 'common', lng, ...options });

describe('formatting inside messages', () => {
  beforeAll(async () => {
    await initI18nInstance('en');
    for (const lng of LANGUAGES) {
      i18n.addResources(lng, 'common', SENTENCES);
    }
  });

  afterEach(async () => {
    await initI18nInstance('en');
  });

  test.each(LANGUAGES)('AC-N-4: %s formats a number like Intl in that language', (lng) => {
    const expected = new Intl.NumberFormat(lng, { minimumFractionDigits: 2 }).format(AMOUNT);

    expect(translate('total', { amount: AMOUNT }, lng)).toBe(`Total ${expected}`);
  });

  test.each(LANGUAGES)('AC-N-4: %s formats currency like Intl in that language', (lng) => {
    const expected = new Intl.NumberFormat(lng, { style: 'currency', currency: 'USD' }).format(
      AMOUNT,
    );

    expect(translate('price', { amount: AMOUNT }, lng)).toBe(`Total ${expected}`);
  });

  test.each(LANGUAGES)('AC-N-4: %s formats a date like Intl in that language', (lng) => {
    const expected = new Intl.DateTimeFormat(lng, { dateStyle: 'long' }).format(DAY);

    expect(translate('day', { date: DAY }, lng)).toBe(`On ${expected}`);
  });

  test('AC-N-4: en and ar render the same value differently', () => {
    expect(translate('price', { amount: AMOUNT }, 'en')).toBe('Total $1,234.50');
    expect(translate('price', { amount: AMOUNT }, 'ar')).not.toBe(
      translate('price', { amount: AMOUNT }, 'en'),
    );
    expect(translate('day', { date: DAY }, 'en')).toBe('On November 18, 2026');
    expect(translate('day', { date: DAY }, 'ar')).toContain('نوفمبر');
  });

  test('AC-N-4: the item details sentences format numbers inside the message', async () => {
    await initI18nInstance('en');

    expect(i18n.t('details.stock', { ns: 'items', stock: 12345 })).toBe('In stock: 12,345');
    expect(i18n.t('details.rating', { ns: 'items', rating: 4.5 })).toBe('Rating: 4.5 / 5');
  });

  test('AC-N-4: the slot sheet title keeps Latin digits in Arabic', async () => {
    await initI18nInstance('ar');

    const title = i18n.t('timeSlot.titleOnDate', { ns: 'common', date: DAY });

    expect(title).toMatch(/18\D+11\D+2026/);
  });
});
