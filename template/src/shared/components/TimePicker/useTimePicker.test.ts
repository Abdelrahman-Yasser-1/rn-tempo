import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act } from '@testing-library/react-native';

import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useTimePicker } from './useTimePicker';

jest.mock('@shared/utils/platform', () => ({ isAndroid: true, isIOS: false }));

describe('useTimePicker on Android', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the system dialog with the current time and reports the picked time', async () => {
    const open = jest.spyOn(DateTimePickerAndroid, 'open').mockReturnValue(undefined);
    const onChange = jest.fn();
    const { result } = await renderHookWithProviders(() =>
      useTimePicker({ value: '14:30', onChange }),
    );
    expect(result.current.hasSheet).toBe(false);
    await act(() => {
      result.current.onOpen();
    });
    expect(open).toHaveBeenCalledTimes(1);
    const options = open.mock.calls[0]?.[0];
    expect(options?.mode).toBe('time');
    expect(options?.value.getHours()).toBe(14);
    options?.onValueChange?.(
      { nativeEvent: { timestamp: 0, utcOffset: 0 } },
      new Date(2026, 0, 1, 7, 5),
    );
    expect(onChange).toHaveBeenCalledWith('07:05');
    expect(result.current.isOpen).toBe(false);
  });
});
