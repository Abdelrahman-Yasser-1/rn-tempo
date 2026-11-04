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

  it.each(['success', 'error', 'info', 'warning'] as const)(
    'renders a %s toast card',
    async (type) => {
      await renderWithProviders(<ToastHost />);
      await showToast(() => {
        toast[type]('Heads up', 'More detail');
      });
      expect(await screen.findByRole('alert', { name: 'Heads up. More detail' })).toBeOnTheScreen();
      expect(screen.getByText('Heads up')).toBeOnTheScreen();
      expect(screen.getByText('More detail')).toBeOnTheScreen();
    },
  );

  it('shows no action buttons or close button by default', async () => {
    await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.info('Plain');
    });
    await screen.findByRole('alert', { name: 'Plain' });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('renders at most two actions', async () => {
    await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.show({
        title: 'Three actions',
        actions: [
          { label: 'One', onPress: jest.fn() },
          { label: 'Two', onPress: jest.fn() },
          { label: 'Three', onPress: jest.fn() },
        ],
      });
    });
    await screen.findByRole('alert', { name: 'Three actions' });
    expect(screen.getByRole('button', { name: 'One' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Two' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Three' })).not.toBeOnTheScreen();
  });

  // The library keeps the card mounted at zero opacity after hiding (and never animates under
  // Jest), so dismissal itself is not observable here; presses reaching the handlers are.
  it('runs an action when it is pressed', async () => {
    const onUndo = jest.fn();
    const { user } = await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.show({
        title: 'Deleted',
        isFixed: true,
        actions: [{ label: 'Undo', onPress: onUndo }],
      });
    });
    await user.press(await screen.findByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('shows a close button when closable and accepts its press', async () => {
    const { user } = await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.show({ title: 'Closable', isClosable: true, isFixed: true });
    });
    await screen.findByRole('alert', { name: 'Closable' });
    const close = screen.getByRole('button', { name: 'Dismiss notification' });
    await user.press(close);
    expect(close).toBeOnTheScreen();
  });

  it('has no close button when not closable', async () => {
    await renderWithProviders(<ToastHost />);
    await showToast(() => {
      toast.show({ title: 'Not closable', isFixed: true });
    });
    await screen.findByRole('alert', { name: 'Not closable' });
    expect(screen.queryByRole('button', { name: 'Dismiss notification' })).not.toBeOnTheScreen();
  });
});
