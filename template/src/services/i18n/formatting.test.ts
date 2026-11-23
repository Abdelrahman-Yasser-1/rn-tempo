import { formatCurrency, formatDate, formatNumber } from '@shared/utils/format';

import { i18n, initI18nInstance } from './i18n';
import { LANGUAGES as REGISTRY, type Language } from './languages';

const LANGUAGES: readonly Language[] = REGISTRY.map(({ code }) => code);
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

  test.each(LANGUAGES)('AC-L-4: %s formats a number like Intl in that language', (lng) => {
    const expected = new Intl.NumberFormat(lng, { minimumFractionDigits: 2 }).format(AMOUNT);

    expect(translate('total', { amount: AMOUNT }, lng)).toBe(`Total ${expected}`);
  });

  test.each(LANGUAGES)('AC-L-4: %s formats currency like Intl in that language', (lng) => {
    const expected = new Intl.NumberFormat(lng, { style: 'currency', currency: 'USD' }).format(
      AMOUNT,
    );

    expect(translate('price', { amount: AMOUNT }, lng)).toBe(`Total ${expected}`);
  });

  test.each(LANGUAGES)('AC-L-4: %s formats a date like Intl in that language', (lng) => {
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

  test.each(LANGUAGES)('AC-L-4: the shared helpers follow the %s locale', (lng) => {
    expect(formatNumber(AMOUNT, lng)).toBe(new Intl.NumberFormat(lng).format(AMOUNT));
    expect(formatCurrency(AMOUNT, 'EUR', lng)).toBe(
      new Intl.NumberFormat(lng, { style: 'currency', currency: 'EUR' }).format(AMOUNT),
    );
    expect(formatDate(DAY, 'long', lng)).toBe(
      new Intl.DateTimeFormat(lng, { dateStyle: 'long' }).format(DAY),
    );
  });

  test('AC-L-4: es, de and fr use their own separators and month names', () => {
    // 12345.67: only the separators are asserted, not the exact spacing between ICU versions.
    expect(formatNumber(12345.67, 'de')).toBe('12.345,67');
    expect(formatNumber(12345.67, 'es')).toBe('12.345,67');
    expect(formatNumber(12345.67, 'fr')).toMatch(/^12\s345,67$/);
    expect(formatNumber(12345.67, 'en')).toBe('12,345.67');

    expect(translate('price', { amount: AMOUNT }, 'de')).toMatch(/1\.234,50/);
    expect(translate('price', { amount: AMOUNT }, 'fr')).toMatch(/1\s234,50/);
    expect(translate('price', { amount: AMOUNT }, 'es')).toMatch(/1234,50/);

    expect(translate('day', { date: DAY }, 'es')).toBe('On 18 de noviembre de 2026');
    expect(translate('day', { date: DAY }, 'de')).toBe('On 18. November 2026');
    expect(translate('day', { date: DAY }, 'fr')).toBe('On 18 novembre 2026');
  });

  test.each(['es', 'de', 'fr'] as const)(
    'AC-L-4: the item details sentences format numbers in %s',
    async (lng) => {
      await initI18nInstance(lng);

      const stock = i18n.t('details.stock', { ns: 'items', stock: 12345 });

      expect(stock).toContain(new Intl.NumberFormat(lng).format(12345));
    },
  );
});
