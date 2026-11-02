import { act } from '@testing-library/react-native';

import * as languageManager from '@services/i18n/languageManager';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useLanguageScreen } from './useLanguageScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

let changeLanguageSpy: jest.SpyInstance;

beforeEach(() => {
  // changeLanguage persists the choice and may restart the app, so it is replaced by a stub.
  changeLanguageSpy = jest.spyOn(languageManager, 'changeLanguage').mockResolvedValue(false);
});

afterEach(() => {
  changeLanguageSpy.mockRestore();
});

async function pick(result: { current: ReturnType<typeof useLanguageScreen> }, value: string) {
  await act(() => {
    result.current.onChange(value);
    return Promise.resolve();
  });
}

describe('useLanguageScreen', () => {
  test('starts with the current language and no confirmation', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen(), {
      language: 'en',
    });

    expect(result.current.language).toBe('en');
    expect(result.current.isConfirmVisible).toBe(false);
  });

  test('picking a different language asks for confirmation without applying it', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());

    await pick(result, 'ar');

    expect(result.current.isConfirmVisible).toBe(true);
    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });

  test('picking the current language does nothing', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());

    await pick(result, 'en');

    expect(result.current.isConfirmVisible).toBe(false);
  });

  test('picking an unsupported value does nothing', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());

    await pick(result, 'fr');

    expect(result.current.isConfirmVisible).toBe(false);
  });

  test('confirming applies the pending language and closes the dialog', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());
    await pick(result, 'ar');

    await act(() => {
      result.current.onConfirm();
      return Promise.resolve();
    });

    expect(changeLanguageSpy).toHaveBeenCalledWith('ar');
    expect(result.current.isConfirmVisible).toBe(false);
  });

  test('confirming without a pending language applies nothing', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());

    await act(() => {
      result.current.onConfirm();
      return Promise.resolve();
    });

    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });

  test('cancelling drops the pending language', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());
    await pick(result, 'ar');

    await act(() => {
      result.current.onCancel();
      return Promise.resolve();
    });
    await act(() => {
      result.current.onConfirm();
      return Promise.resolve();
    });

    expect(result.current.isConfirmVisible).toBe(false);
    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useLanguageScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
