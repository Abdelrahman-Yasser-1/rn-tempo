import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TimePickerSheet } from './TimePickerSheet';

describe('TimePickerSheet', () => {
  it('renders the title and confirms the value on Confirm', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <TimePickerSheet visible value="14:30" onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Select a time' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('14:30');
  });

  it('confirms the default time when nothing was chosen yet', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <TimePickerSheet visible onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('09:00');
  });

  it('forwards minuteInterval, the time mode and the language to the native picker', async () => {
    await renderWithProviders(
      <TimePickerSheet
        visible
        testID="sheet"
        value="14:30"
        minuteInterval={15}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the native wheel has no role to query
    const picker = screen.getByTestId('sheet.picker');
    expect(picker).toHaveProp('minuteInterval', 15);
    expect(picker).toHaveProp('mode', 'time');
    expect(picker).toHaveProp('locale', 'en');
  });

  it('commits the time the wheel was moved to, and only on Confirm', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <TimePickerSheet
        visible
        testID="sheet"
        value="14:30"
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the native wheel has no role to query
    const picker = screen.getByTestId('sheet.picker');
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(picker, 'change', {
      nativeEvent: { timestamp: new Date(2026, 10, 4, 7, 5).getTime(), utcOffset: 0 },
    });
    /* eslint-enable testing-library/no-await-sync-events */
    expect(onConfirm).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('07:05');
  });

  it('discards the draft when the sheet is closed and reopened', async () => {
    const onConfirm = jest.fn();
    const element = (isVisible: boolean) => (
      <TimePickerSheet
        visible={isVisible}
        testID="sheet"
        value="14:30"
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />
    );
    const { user, rerender } = await renderWithProviders(element(true));
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the native wheel has no role to query
    const picker = screen.getByTestId('sheet.picker');
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(picker, 'change', {
      nativeEvent: { timestamp: new Date(2026, 10, 4, 7, 5).getTime(), utcOffset: 0 },
    });
    /* eslint-enable testing-library/no-await-sync-events */
    await rerender(element(false));
    await rerender(element(true));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('14:30');
  });

  it('does not confirm on Cancel', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <TimePickerSheet visible value="14:30" onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
