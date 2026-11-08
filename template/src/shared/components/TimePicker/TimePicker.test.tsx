import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TimePicker } from './TimePicker';

describe('TimePicker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the placeholder, then the formatted time', async () => {
    const { rerender } = await renderWithProviders(
      <TimePicker label="Time" onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select a time')).toBeOnTheScreen();
    await rerender(<TimePicker label="Time" value="14:30" onChange={jest.fn()} />);
    expect(screen.getByText(/^2:30\sPM$/)).toBeOnTheScreen();
  });

  it('opens the sheet on iOS and reports the confirmed time', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimePicker label="Time" value="14:30" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Time' }));
    expect(present).toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('14:30');
  });

  it('commits the time moved to on the wheel only after Confirm', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimePicker label="Time" testID="time" value="14:30" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Time' }));
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the native wheel has no role to query
    const wheel = screen.getByTestId('time.sheet.picker');
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(wheel, 'change', {
      nativeEvent: { timestamp: new Date(2026, 10, 4, 7, 5).getTime(), utcOffset: 0 },
    });
    /* eslint-enable testing-library/no-await-sync-events -- end of the block disabled above */
    expect(onChange).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('07:05');
  });

  it('confirms 09:00 when there is no value yet', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(<TimePicker label="Time" onChange={onChange} />);
    await user.press(screen.getByRole('button', { name: 'Time' }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('09:00');
  });

  it('does not commit on Cancel', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimePicker label="Time" value="14:30" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Time' }));
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards minuteInterval to the wheel', async () => {
    await renderWithProviders(
      <TimePicker label="Time" testID="time" minuteInterval={15} onChange={jest.fn()} />,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the native wheel has no role to query
    expect(screen.getByTestId('time.sheet.picker')).toHaveProp('minuteInterval', 15);
  });

  it('does not open when disabled or read-only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user, rerender } = await renderWithProviders(
      <TimePicker disabled label="Time" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Time' }));
    await rerender(<TimePicker readOnly label="Time" onChange={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Time' }));
    expect(present).not.toHaveBeenCalled();
  });

  it('uses a custom formatter, then the default again', async () => {
    const { rerender } = await renderWithProviders(
      <TimePicker
        label="Time"
        value="14:30"
        formatValue={(time) => `at ${time}`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('at 14:30')).toBeOnTheScreen();
    await rerender(<TimePicker label="Time" value="14:30" onChange={jest.fn()} />);
    expect(screen.getByText(/^2:30\sPM$/)).toBeOnTheScreen();
  });

  it('formats the time in Arabic with Latin digits', async () => {
    await renderWithProviders(<TimePicker label="الوقت" value="14:30" onChange={jest.fn()} />, {
      language: 'ar',
    });
    expect(screen.getByText(/^2:30/)).toBeOnTheScreen();
  });
});
