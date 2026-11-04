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

  test('reports typed digits as E.164 without the trunk zero', async () => {
    const { result, onChange } = await setup('');

    await act(() => {
      result.current.onChangeText('0512');
      return Promise.resolve();
    });

    const [e164, details] = onChange.mock.lastCall as [
      string,
      { country: { iso2: string }; nationalNumber: string },
    ];
    expect(e164).toBe('+966512');
    expect(details.nationalNumber).toBe('512');
    expect(details.country.iso2).toBe('SA');
  });

  test('drops anything that is not a digit from typed input', async () => {
    const { result, onChange } = await setup('');

    await act(() => {
      result.current.onChangeText('5-1 x2');
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith('+966512', expect.anything());
  });

  test('reports an empty value for an empty or zero-only input', async () => {
    const { result, onChange } = await setup('+966512');

    await act(() => {
      result.current.onChangeText('0');
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenLastCalledWith('', expect.objectContaining({ nationalNumber: '' }));
  });

  test('a pasted + number switches the country and replaces the number', async () => {
    const { result, rerender, onChange } = await setup('+966512345678');

    await act(() => {
      result.current.onChangeText(' +20 100 123 4567 ');
      return Promise.resolve();
    });

    const [e164, details] = onChange.mock.lastCall as [string, { country: { iso2: string } }];
    expect(e164).toBe('+201001234567');
    expect(details.country.iso2).toBe('EG');
    await rerender({ value: e164 });
    expect(result.current.country.iso2).toBe('EG');
  });

  test('a pasted 00 number switches the country the same way', async () => {
    const { result, rerender, onChange } = await setup('');

    await act(() => {
      result.current.onChangeText('00971501234567');
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(
      '+971501234567',
      expect.objectContaining({ nationalNumber: '501234567' }),
    );
    await rerender({ value: '+971501234567' });
    expect(result.current.country.iso2).toBe('AE');
  });

  test('a pasted + number with an unknown dial code is read as digits', async () => {
    const { result, onChange } = await setup('');

    await act(() => {
      result.current.onChangeText('+999123');
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith('+966999123', expect.anything());
    expect(result.current.country.iso2).toBe('SA');
  });

  test('changing the country re-emits the same digits with the new dial code', async () => {
    const { result, onChange } = await setup('+966512345678');
    const egypt = findCountry('EG');

    await act(() => {
      if (egypt) {
        result.current.onCountryChange(egypt);
      }
      return Promise.resolve();
    });

    const [e164, details] = onChange.mock.lastCall as [
      string,
      { country: unknown; nationalNumber: string },
    ];
    expect(e164).toBe('+20512345678');
    expect(details.nationalNumber).toBe('512345678');
    expect(details.country).toBe(egypt);
  });

  test('changing the country with no number emits an empty value', async () => {
    const { result, onChange } = await setup('');
    const egypt = findCountry('EG');

    await act(() => {
      if (egypt) {
        result.current.onCountryChange(egypt);
      }
      return Promise.resolve();
    });

    const [e164, details] = onChange.mock.lastCall as [string, { country: unknown }];
    expect(e164).toBe('');
    expect(details.country).toBe(egypt);
    expect(result.current.country.iso2).toBe('EG');
  });

  test('a picked country is dropped when the value moves to another dial code', async () => {
    const { result, rerender } = await setup('');
    const canada = findCountry('CA');

    await act(() => {
      if (canada) {
        result.current.onCountryChange(canada);
      }
      return Promise.resolve();
    });
    await rerender({ value: '+201001234567' });

    expect(result.current.country.iso2).toBe('EG');
    expect(result.current.nationalNumber).toBe('1001234567');
  });

  test('a shared dial code resolves to the primary country until one is picked', async () => {
    const { result } = await setup('+14165550123');

    expect(result.current.country.iso2).toBe('US');
  });

  test('falls back to Saudi Arabia for an unknown default country', async () => {
    const { result } = await setup('', 'ZZ');

    expect(result.current.country.iso2).toBe('SA');
  });
});
