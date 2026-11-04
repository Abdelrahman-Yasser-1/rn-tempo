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

  it('enables both buttons between the bounds', async () => {
    await renderWithProviders(
      <NumberInput label="Quantity" value={2} min={1} max={4} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled();
  });

  it('does not report a change when a disabled bound button is pressed', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <NumberInput label="Quantity" value={4} min={1} max={4} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops at the bound when a step would overshoot it', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <NumberInput label="Quantity" value={9} min={0} max={10} step={5} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('ignores typed characters that are not digits', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} min={1} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'abc');
    expect(input).toHaveDisplayValue('');
    await fireEvent.changeText(input, '-1.5e');
    expect(input).toHaveDisplayValue('15');
    /* eslint-enable testing-library/no-await-sync-events */
  });

  it('keeps the value when the field is left empty', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} min={1} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');
    /* eslint-enable testing-library/no-await-sync-events */
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveDisplayValue('3');
  });

  it('reports a typed value that is in range as it is', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} min={1} max={10} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '7');
    await fireEvent(input, 'blur');
    /* eslint-enable testing-library/no-await-sync-events */
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('clamps a value below the minimum up to it on blur', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={8} min={5} max={10} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '2');
    await fireEvent(input, 'blur');
    /* eslint-enable testing-library/no-await-sync-events */
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('clamps on submit, and the blur that follows reports nothing more', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} min={1} max={10} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '99');
    await fireEvent(input, 'submitEditing');
    await fireEvent(input, 'blur');
    /* eslint-enable testing-library/no-await-sync-events */
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('shows the plain number while editing and the formatted one afterwards', async () => {
    await renderWithProviders(
      <NumberInput
        label="Weight"
        value={7}
        formatValue={(value) => `${String(value)} kg`}
        onChange={jest.fn()}
      />,
    );
    const input = screen.getByRole('adjustable', { name: 'Weight' });
    expect(input).toHaveAccessibilityValue({ now: 7, text: '7 kg' });
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'focus');
    expect(input).toHaveDisplayValue('7');
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'blur');
    expect(input).toHaveDisplayValue('7 kg');
  });

  it('leaves the maximum out of the accessibility value when there is no upper bound', async () => {
    await renderWithProviders(<NumberInput label="Quantity" value={3} onChange={jest.fn()} />);
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    expect(input).toHaveAccessibilityValue({ min: 0, now: 3 });
    expect(input.props.accessibilityValue).not.toHaveProperty('max', expect.anything());
  });

  it('respects the step and the bounds in the accessibility actions', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <NumberInput label="Quantity" value={9} min={0} max={10} step={5} onChange={onChange} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(10);
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(4);
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(input, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('declares the increment and decrement accessibility actions', async () => {
    await renderWithProviders(<NumberInput label="Quantity" value={3} onChange={jest.fn()} />);
    expect(screen.getByRole('adjustable', { name: 'Quantity' })).toHaveProp(
      'accessibilityActions',
      [{ name: 'increment' }, { name: 'decrement' }],
    );
  });

  it('is inert and reported disabled when disabled', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <NumberInput label="Quantity" value={3} disabled onChange={onChange} testID="qty" />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    expect(input).toBeDisabled();
    expect(input).toHaveProp('editable', false);
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is not editable when read only, but still readable', async () => {
    await renderWithProviders(
      <NumberInput label="Quantity" value={3} readOnly onChange={jest.fn()} />,
    );
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    expect(input).toHaveProp('editable', false);
    expect(input).toHaveDisplayValue('3');
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  });

  it('shows the helper text and the sub label', async () => {
    await renderWithProviders(
      <NumberInput
        label="Quantity"
        required
        subLabel="(units)"
        helperText="Up to 10"
        value={3}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Up to 10')).toBeOnTheScreen();
    expect(screen.getByText('(units)')).toBeOnTheScreen();
  });
});
