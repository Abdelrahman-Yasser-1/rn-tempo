import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PhoneInput } from './PhoneInput';
import type { PhoneInputProps } from './types';

function Stateful({ onChange }: Readonly<{ onChange: PhoneInputProps['onChange'] }>) {
  const [value, setValue] = useState('');

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
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
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
});
