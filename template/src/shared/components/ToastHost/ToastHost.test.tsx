import { act, screen } from '@testing-library/react-native';

import { toast } from '@services/toast/toast';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ToastHost } from './ToastHost';

/** Shows toasts inside an async act so the host flushes its state before assertions. */
async function showToast(show: () => void): Promise<void> {
  await act(() => {
    show();
    return Promise.resolve();
  });
}

describe('ToastHost', () => {
  afterEach(async () => {
    await act(() => {
      toast.hide();
      return Promise.resolve();
    });
  });

  it('renders a typed toast with its title and message as one alert', async () => {
    await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.success('Saved', 'Your changes are stored');
    });
    expect(
      await screen.findByRole('alert', { name: 'Saved. Your changes are stored' }),
    ).toBeOnTheScreen();
  });

  it('uses the title alone when there is no message', async () => {
    await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.error('Network down');
    });
    expect(await screen.findByRole('alert', { name: 'Network down' })).toBeOnTheScreen();
  });

  it('runs the onPress handler when the toast is tapped', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.show({ type: 'info', title: 'Update ready', onPress });
    });
    await user.press(await screen.findByRole('alert', { name: 'Update ready' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
