import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Slider } from './Slider';

describe('Slider', () => {
  it('is an adjustable control exposing min, max and now', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 40,
    });
  });

  it('shows the formatted value and the range labels', async () => {
    await renderWithProviders(
      <Slider
        label="Battery"
        value={40}
        min={0}
        max={100}
        showValue
        formatValue={(value) => `${String(value)}%`}
        onChange={jest.fn()}
        testID="slider"
      />,
    );
    expect(screen.getByText('40%')).toBeOnTheScreen();
    expect(screen.getByText('0%')).toBeOnTheScreen();
    expect(screen.getByText('100%')).toBeOnTheScreen();
  });

  it('steps from the adjustable accessibility actions and reports the end of the change', async () => {
    const onChange = jest.fn();
    const onChangeEnd = jest.fn();
    await renderWithProviders(
      <Slider
        label="Volume"
        value={40}
        min={0}
        max={100}
        step={10}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    );
    const slider = screen.getByRole('adjustable', { name: 'Volume' });
    await fireEvent(slider, 'RNCSliderAccessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenLastCalledWith(50);
    expect(onChangeEnd).toHaveBeenLastCalledWith(50);
    await fireEvent(slider, 'RNCSliderAccessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).toHaveBeenLastCalledWith(30);
  });

  it('does not step past the bounds', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <Slider label="Volume" value={100} min={0} max={100} onChange={onChange} />,
    );
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Volume' }),
      'RNCSliderAccessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      },
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an announced error in place of the helper text', async () => {
    await renderWithProviders(
      <Slider
        label="Volume"
        value={0}
        min={0}
        max={100}
        helperText="Applies to alerts"
        errorText="Pick at least 10"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Applies to alerts')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Pick at least 10' })).toBeOnTheScreen();
  });

  it('is disabled when disabled', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={0} min={0} max={100} disabled onChange={jest.fn()} />,
    );
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toBeDisabled();
  });

  it('reports every drag value and the final one when the user lets go', async () => {
    const onChange = jest.fn();
    const onChangeEnd = jest.fn();
    await renderWithProviders(
      <Slider
        label="Volume"
        value={40}
        min={0}
        max={100}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    );
    const slider = screen.getByRole('adjustable', { name: 'Volume' });
    await fireEvent(slider, 'valueChange', 55);
    expect(onChange).toHaveBeenLastCalledWith(55);
    expect(onChangeEnd).not.toHaveBeenCalled();
    await fireEvent(slider, 'slidingComplete', 60);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenLastCalledWith(60);
  });

  it('survives the end of a drag without an onChangeEnd handler', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} onChange={jest.fn()} />,
    );
    await fireEvent(screen.getByRole('adjustable', { name: 'Volume' }), 'slidingComplete', 60);
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toBeOnTheScreen();
  });

  it('shows no value readout unless asked to', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} onChange={jest.fn()} testID="slider" />,
    );
    expect(screen.queryByText('40')).not.toBeOnTheScreen();
    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.getByText('100')).toBeOnTheScreen();
  });

  it('shows the plain value when showValue is on and there is no formatter', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} showValue onChange={jest.fn()} />,
    );
    expect(screen.getByText('40')).toBeOnTheScreen();
  });

  it('uses custom range labels in place of the formatted bounds', async () => {
    await renderWithProviders(
      <Slider
        label="Speed"
        value={2}
        min={1}
        max={5}
        minLabel="Slow"
        maxLabel="Fast"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Slow')).toBeOnTheScreen();
    expect(screen.getByText('Fast')).toBeOnTheScreen();
    expect(screen.queryByText('1')).not.toBeOnTheScreen();
  });

  it('gives screen readers the formatted value as text', async () => {
    await renderWithProviders(
      <Slider
        label="Battery"
        value={40}
        min={0}
        max={100}
        formatValue={(value) => `${String(value)}%`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('adjustable', { name: 'Battery' })).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 40,
      text: '40%',
    });
  });

  it('declares the increment and decrement accessibility actions', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toHaveProp('accessibilityActions', [
      { name: 'increment' },
      { name: 'decrement' },
    ]);
  });

  it('does not step below the minimum, and clamps a step that would overshoot', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <Slider label="Volume" value={3} min={0} max={100} step={5} onChange={onChange} />,
    );
    const slider = screen.getByRole('adjustable', { name: 'Volume' });
    await fireEvent(slider, 'RNCSliderAccessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('ignores accessibility actions it does not know', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} onChange={onChange} />,
    );
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Volume' }),
      'RNCSliderAccessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot be changed when read only', async () => {
    await renderWithProviders(
      <Slider label="Volume" value={40} min={0} max={100} readOnly onChange={jest.fn()} />,
    );
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toBeDisabled();
  });

  it('shows the helper text, the sub label and the value next to the label', async () => {
    await renderWithProviders(
      <Slider
        label="Volume"
        subLabel="(percent)"
        helperText="Applies to alerts"
        value={40}
        min={0}
        max={100}
        showValue
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Applies to alerts')).toBeOnTheScreen();
    expect(screen.getByText('(percent)')).toBeOnTheScreen();
  });
});
