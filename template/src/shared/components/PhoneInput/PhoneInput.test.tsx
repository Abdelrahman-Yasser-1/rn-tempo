import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PhoneInput } from './PhoneInput';
import type { PhoneInputProps } from './types';

function Stateful({
  onChange,
  initialValue = '',
}: Readonly<{ onChange: PhoneInputProps['onChange']; initialValue?: string }>) {
  const [value, setValue] = useState(initialValue);

  return (
    <PhoneInput
      label="Mobile"
      value={value}
      onChange={(e164, details) => {
        setValue(e164);
        onChange(e164, details);
      }}
    />
  );
}

describe('PhoneInput', () => {
  it('shows the Saudi Arabia dial code by default', async () => {
    await renderWithProviders(<PhoneInput label="Mobile" value="" onChange={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Saudi Arabia, +966',
    });
  });

  it('splits an E.164 value into the country and the national number', async () => {
    await renderWithProviders(
      <PhoneInput label="Mobile" value="+201001234567" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Egypt, +20',
    });
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('1001234567');
  });

  it('reports E.164 with details as digits are typed, dropping the trunk zero', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(<Stateful onChange={onChange} />);
    await user.type(screen.getByLabelText('Mobile'), '0512345678');
    expect(onChange).toHaveBeenLastCalledWith(
      '+966512345678',
      expect.objectContaining({ nationalNumber: '512345678' }),
    );
  });

  it('keeps the number and changes the dial code when a country is picked', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <PhoneInput label="Mobile" value="+966512345678" onChange={onChange} />,
    );
    await user.press(screen.getByRole('radio', { name: 'Afghanistan, +93' }));
    expect(onChange).toHaveBeenLastCalledWith(
      '+93512345678',
      expect.objectContaining({ nationalNumber: '512345678' }),
    );
  });

  it('switches the country when an international number is pasted', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<PhoneInput label="Mobile" value="" onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '+971 50 123 4567');
    const [e164, details] = onChange.mock.lastCall as Parameters<PhoneInputProps['onChange']>;
    expect(e164).toBe('+971501234567');
    expect(details.country.iso2).toBe('AE');
    expect(details.nationalNumber).toBe('501234567');
  });

  it('shows an announced error and is inert when disabled', async () => {
    await renderWithProviders(
      <PhoneInput
        label="Mobile"
        value=""
        disabled
        errorText="Enter a valid phone number"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert', { name: 'Enter a valid phone number' })).toBeOnTheScreen();
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeDisabled();
  });

  it('shows an empty number field for an empty value', async () => {
    await renderWithProviders(<PhoneInput label="Mobile" value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('');
  });

  it('starts from the default country given', async () => {
    await renderWithProviders(
      <PhoneInput label="Mobile" value="" defaultCountry="AE" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'United Arab Emirates, +971',
    });
  });

  it('shows the digits as typed while reporting the value without the trunk zero', async () => {
    const { user } = await renderWithProviders(<Stateful onChange={jest.fn()} />);
    await user.type(screen.getByLabelText('Mobile'), '0512345678');
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('0512345678');
  });

  it('keeps digits only when letters and separators are typed', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Stateful onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '5a1-2 3');
    expect(onChange).toHaveBeenLastCalledWith(
      '+9665123',
      expect.objectContaining({ nationalNumber: '5123' }),
    );
  });

  it('reports an empty value once the number is cleared', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Stateful onChange={onChange} initialValue="+966512345678" />);
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '');
    const [e164, details] = onChange.mock.lastCall as Parameters<PhoneInputProps['onChange']>;
    expect(e164).toBe('');
    expect(details.nationalNumber).toBe('');
    expect(details.country.iso2).toBe('SA');
  });

  it('reports the new country and the same number when the country changes', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Stateful onChange={onChange} initialValue="+966512345678" />,
    );
    await user.press(screen.getByRole('radio', { name: 'Albania, +355' }));
    const [e164, details] = onChange.mock.lastCall as Parameters<PhoneInputProps['onChange']>;
    expect(e164).toBe('+355512345678');
    expect(details.country.iso2).toBe('AL');
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Albania, +355',
    });
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('512345678');
  });

  it('re-emits an empty value with the new country when no number is entered yet', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(<Stateful onChange={onChange} />);
    await user.press(screen.getByRole('radio', { name: 'Albania, +355' }));
    const [e164, details] = onChange.mock.lastCall as Parameters<PhoneInputProps['onChange']>;
    expect(e164).toBe('');
    expect(details.country.iso2).toBe('AL');
  });

  it('switches the country when a number with a 00 prefix is pasted', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Stateful onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '0020 100 123 4567');
    const [e164, details] = onChange.mock.lastCall as Parameters<PhoneInputProps['onChange']>;
    expect(e164).toBe('+201001234567');
    expect(details.country.iso2).toBe('EG');
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Egypt, +20',
    });
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('1001234567');
  });

  it('treats a pasted plus number with an unknown dial code as plain digits', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Stateful onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '+999123');
    expect(onChange).toHaveBeenLastCalledWith(
      '+966999123',
      expect.objectContaining({ nationalNumber: '999123' }),
    );
  });

  it('keeps the country the user picked when it shares its dial code with another', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(<Stateful onChange={onChange} />);
    jest.useFakeTimers();
    await fireEvent.changeText(screen.getByLabelText('Search countries'), 'canada');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });
    jest.useRealTimers();
    await user.press(screen.getByRole('radio', { name: 'Canada, +1' }));
    await user.type(screen.getByLabelText('Mobile'), '4165550123');

    const [e164, details] = onChange.mock.lastCall as Parameters<PhoneInputProps['onChange']>;
    expect(e164).toBe('+14165550123');
    expect(details.country.iso2).toBe('CA');
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Canada, +1',
    });
  });

  it('shows the primary country for a shared dial code that arrives from outside', async () => {
    await renderWithProviders(
      <PhoneInput label="Mobile" value="+14165550123" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'United States, +1',
    });
  });

  it('is inert when disabled', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <PhoneInput label="Mobile" value="+966512345678" disabled onChange={onChange} />,
    );
    expect(screen.getByLabelText('Mobile')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeDisabled();
    await user.type(screen.getByLabelText('Mobile'), '1');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the number but cannot be edited or change country when read only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <PhoneInput label="Mobile" value="+966512345678" readOnly onChange={jest.fn()} />,
    );
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('512345678');
    expect(screen.getByLabelText('Mobile')).toHaveProp('editable', false);
    await user.press(screen.getByRole('combobox', { name: 'Country' }));
    expect(present).not.toHaveBeenCalled();
    present.mockRestore();
  });

  it('shows the helper text, and the error in place of it', async () => {
    const { rerender } = await renderWithProviders(
      <PhoneInput label="Mobile" value="" helperText="With country code" onChange={jest.fn()} />,
    );
    expect(screen.getByText('With country code')).toBeOnTheScreen();
    await rerender(
      <PhoneInput
        label="Mobile"
        value=""
        helperText="With country code"
        errorText="Invalid"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('With country code')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Invalid' })).toBeOnTheScreen();
  });
});
