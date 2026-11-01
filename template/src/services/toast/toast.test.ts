import Toast from 'react-native-toast-message';

import { toast } from './toast';

describe('toast', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps the generic show call onto the library with a 4 second default duration', () => {
    const show = jest.spyOn(Toast, 'show').mockReturnValue(undefined);
    toast.show({ title: 'Saved' });
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text1: 'Saved',
        text2: undefined,
        visibilityTime: 4000,
      }),
    );
  });

  it('passes an explicit type, message, duration and press handler through', () => {
    const show = jest.spyOn(Toast, 'show').mockReturnValue(undefined);
    const onPress = jest.fn();
    toast.show({
      type: 'warning',
      title: 'Low battery',
      message: 'Connect a charger',
      durationMs: 1500,
      onPress,
    });
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        text1: 'Low battery',
        text2: 'Connect a charger',
        visibilityTime: 1500,
        onPress,
      }),
    );
  });

  it.each([
    ['success', toast.success],
    ['error', toast.error],
    ['info', toast.info],
    ['warning', toast.warning],
  ] as const)('the %s shortcut shows a %s toast', (type, shortcut) => {
    const show = jest.spyOn(Toast, 'show').mockReturnValue(undefined);
    shortcut('Title', 'Body');
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ type, text1: 'Title', text2: 'Body' }),
    );
  });

  it('hide dismisses the visible toast', () => {
    const hide = jest.spyOn(Toast, 'hide').mockReturnValue(undefined);
    toast.hide();
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
