import { act, renderHook } from '@testing-library/react-native';

import { findCountry } from '@shared/utils/countries';

import { usePhoneInput } from './usePhoneInput';

async function setup(value: string, defaultCountry?: string) {
  const onChange = jest.fn();
  const view = await renderHook(
    (props: { value: string }) => usePhoneInput({ value: props.value, onChange, defaultCountry }),
    { initialProps: { value } },
  );
  return { ...view, onChange };
}

describe('usePhoneInput', () => {
  test('parses the country and the national number from the value', async () => {
    const { result } = await setup('+966512345678');

    expect(result.current.country.iso2).toBe('SA');
    expect(result.current.nationalNumber).toBe('512345678');
  });

  test('uses the default country for an empty value', async () => {
    const { result: saudi } = await setup('');
    const { result: other } = await setup('', 'EG');

    expect(saudi.current.country.iso2).toBe('SA');
    expect(other.current.country.iso2).toBe('EG');
  });

  test('keeps the typed digits, trunk zero included, while the value drops it', async () => {
    const { result, rerender, onChange } = await setup('');

    await act(() => {
      result.current.onChangeText('05');
      return Promise.resolve();
    });
    expect(onChange).toHaveBeenLastCalledWith('+9665', expect.anything());
    await rerender({ value: '+9665' });

    expect(result.current.nationalNumber).toBe('05');
  });

  test('shows the parsed digits when the value changes from outside', async () => {
    const { result, rerender } = await setup('+966512345678');

    await rerender({ value: '+966555555555' });

    expect(result.current.nationalNumber).toBe('555555555');
  });

  test('keeps a picked country that shares the dial code of the value', async () => {
    const { result, rerender } = await setup('');
    const canada = findCountry('CA');

    await act(() => {
      if (canada) {
        result.current.onCountryChange(canada);
      }
      return Promise.resolve();
    });
    await rerender({ value: '+14165550123' });

    expect(result.current.country.iso2).toBe('CA');
  });
});
