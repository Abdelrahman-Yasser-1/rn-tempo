import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
  it('is an adjustable control named by its label and exposing min, max and now', async () => {
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} min={1} max={5} onChange={jest.fn()} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    expect(input).toHaveAccessibilityValue({ min: 1, max: 5, now: 3 });
    expect(input).toHaveDisplayValue('3');
  });

  it('steps with the + and − buttons', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <NumberInput label="Quantity" value={3} step={2} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    await user.press(screen.getByRole('button', { name: 'Decrease' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('disables the buttons at the bounds', async () => {
    const { rerender } = await renderWithProviders(
      <NumberInput label="Quantity" value={1} min={1} max={4} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled();
    await rerender(<NumberInput label="Quantity" value={4} min={1} max={4} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  });

  it('steps from the adjustable accessibility actions', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<NumberInput label="Quantity" value={3} onChange={onChange} />);
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(4);
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('keeps digits only and clamps to the bounds on blur', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} min={1} max={10} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '4a2');
    expect(input).toHaveDisplayValue('42');
    await fireEvent(input, 'blur');
    /* eslint-enable testing-library/no-await-sync-events */
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('shows the formatted value when not editing', async () => {
    await renderWithProviders(
      <NumberInput
        label="Weight"
        value={7}
        formatValue={(value) => `${String(value)} kg`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('adjustable', { name: 'Weight' })).toHaveDisplayValue('7 kg');
  });

  it('shows an announced error in place of the helper text', async () => {
    await renderWithProviders(
      <NumberInput
        label="Quantity"
        value={0}
        helperText="Up to 10"
        errorText="Choose at least 1"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Up to 10')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Choose at least 1' })).toBeOnTheScreen();
  });

  it('is inert when read only', async () => {
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} readOnly onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    expect(screen.getByRole('adjustable', { name: 'Quantity' })).toHaveDisplayValue('3');
  });
});
