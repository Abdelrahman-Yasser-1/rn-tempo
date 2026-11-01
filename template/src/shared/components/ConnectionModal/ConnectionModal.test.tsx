import NetInfo from '@react-native-community/netinfo';
import { act, screen, waitFor } from '@testing-library/react-native';

import { useNetworkStore } from '@services/network/network';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ConnectionModal } from './ConnectionModal';

const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };
const TITLE = 'No connection';

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });

describe('ConnectionModal', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
  });

  afterEach(() => {
    useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
  });

  it('stays hidden while online', async () => {
    useNetworkStore.setState(ONLINE);
    await renderWithProviders(<ConnectionModal delayMs={0} />);
    await wait(20);
    expect(screen.queryByRole('header', { name: TITLE })).not.toBeOnTheScreen();
  });

  it('does not appear before delayMs has elapsed while offline', async () => {
    useNetworkStore.setState(OFFLINE);
    await renderWithProviders(<ConnectionModal delayMs={60_000} />);
    expect(screen.queryByRole('header', { name: TITLE })).not.toBeOnTheScreen();
  });

  it('appears once it has been offline for delayMs', async () => {
    useNetworkStore.setState(OFFLINE);
    await renderWithProviders(<ConnectionModal delayMs={20} />);
    expect(await screen.findByRole('header', { name: TITLE })).toBeOnTheScreen();
  });

  it('never appears when disabled', async () => {
    useNetworkStore.setState(OFFLINE);
    await renderWithProviders(<ConnectionModal enabled={false} delayMs={0} />);
    await wait(20);
    expect(screen.queryByRole('header', { name: TITLE })).not.toBeOnTheScreen();
  });

  it('refreshes NetInfo and calls onRetry from the retry button', async () => {
    useNetworkStore.setState(OFFLINE);
    const onRetry = jest.fn();
    const { user } = await renderWithProviders(
      <ConnectionModal delayMs={0} onRetry={onRetry} />,
    );
    await user.press(await screen.findByRole('button', { name: 'Check again' }));
    expect(NetInfo.refresh).toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('closes by itself when the connection returns', async () => {
    useNetworkStore.setState(OFFLINE);
    await renderWithProviders(<ConnectionModal delayMs={0} />);
    expect(await screen.findByRole('header', { name: TITLE })).toBeOnTheScreen();
    await act(() => {
      useNetworkStore.setState(ONLINE);
    });
    // The modal keeps its children mounted through the fade-out, so wait for removal.
    await waitFor(() => {
      expect(screen.queryByRole('header', { name: TITLE })).not.toBeOnTheScreen();
    });
  });
});
