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
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(slider, 'RNCSliderAccessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenLastCalledWith(50);
    expect(onChangeEnd).toHaveBeenLastCalledWith(50);
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
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
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
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
});
