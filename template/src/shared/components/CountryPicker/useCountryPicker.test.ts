import { act, renderHook } from '@testing-library/react-native';

import { initI18nInstance } from '@services/i18n/i18n';
import { initStorage } from '@services/storage/storage';

import { useCountryPicker } from './useCountryPicker';

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

async function setup(value?: string, defaultCountry?: string) {
  const onChange = jest.fn();
  const sheet = { present: jest.fn(), dismiss: jest.fn() };
  const view = await renderHook(() => useCountryPicker({ value, defaultCountry, onChange }));
  view.result.current.sheetRef.current = sheet as never;
  return { ...view, onChange, sheet };
}

describe('useCountryPicker', () => {
  test('selects the country of the value', async () => {
    const { result } = await setup('EG');

    expect(result.current.selected?.iso2).toBe('EG');
  });

  test('falls back to Saudi Arabia, then to the given default', async () => {
    const { result: fallback } = await setup();
    const { result: unknown } = await setup('ZZ', 'AE');

    expect(fallback.current.selected?.iso2).toBe('SA');
    expect(unknown.current.selected?.iso2).toBe('AE');
  });

  test('lists every country', async () => {
    const { result } = await setup();

    expect(result.current.visibleCountries.length).toBeGreaterThan(200);
  });

  test('onSelect reports the country and dismisses the sheet', async () => {
    const { result, onChange, sheet } = await setup();
    const egypt = result.current.visibleCountries.find((country) => country.iso2 === 'EG');

    await act(() => {
      if (egypt) {
        result.current.onSelect(egypt);
      }
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(egypt);
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  test('onOpen presents the sheet and onDismiss closes it', async () => {
    const { result, sheet } = await setup();

    await act(() => {
      result.current.onOpen();
      return Promise.resolve();
    });
    expect(result.current.isOpen).toBe(true);
    expect(sheet.present).toHaveBeenCalledTimes(1);

    await act(() => {
      result.current.onDismiss();
      return Promise.resolve();
    });
    expect(result.current.isOpen).toBe(false);
  });

  test('onClose dismisses the sheet without choosing a country', async () => {
    const { result, onChange, sheet } = await setup();

    result.current.onClose();

    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('onDismiss clears the search', async () => {
    const { result } = await setup();

    await act(() => {
      result.current.onSearchChange('egy');
      return Promise.resolve();
    });
    expect(result.current.search).toBe('egy');
    await act(() => {
      result.current.onDismiss();
      return Promise.resolve();
    });

    expect(result.current.search).toBe('');
  });

  test('narrows the list after the search debounce', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await setup();

      await act(() => {
        result.current.onSearchChange('+966');
        return Promise.resolve();
      });
      expect(result.current.visibleCountries.length).toBeGreaterThan(200);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });

      expect(result.current.visibleCountries.map((country) => country.iso2)).toEqual(['SA']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('sorts the list and names the countries by the language', async () => {
    const { result: english } = await setup();
    const englishName = english.current.selected?.nameEn;
    await initI18nInstance('ar');
    try {
      const { result: arabic } = await setup('EG');
      const names = arabic.current.visibleCountries.map((country) =>
        arabic.current.getName(country),
      );

      expect(arabic.current.selected?.iso2).toBe('EG');
      expect(names).toContain('مصر');
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ar')));
      expect(englishName).toBe('Saudi Arabia');
    } finally {
      await initI18nInstance('en');
    }
  });
});
