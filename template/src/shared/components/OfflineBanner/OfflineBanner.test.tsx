import { act, screen, waitFor } from '@testing-library/react-native';

import { useNetworkStore } from '@services/network/network';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
  });

  it('renders nothing while online', async () => {
    useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
    await renderWithProviders(<OfflineBanner />);
    expect(screen.queryByText('You are offline')).not.toBeOnTheScreen();
  });

  it('shows the default message while offline', async () => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
    await renderWithProviders(<OfflineBanner />);
    expect(screen.getByText('You are offline')).toBeOnTheScreen();
  });

  it('shows a custom message when given', async () => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
    await renderWithProviders(<OfflineBanner message="Saved offline" />);
    expect(screen.getByText('Saved offline')).toBeOnTheScreen();
  });

  it('disappears when the connection returns', async () => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
    await renderWithProviders(<OfflineBanner />);
    expect(screen.getByText('You are offline')).toBeOnTheScreen();
    await act(() => {
      useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
    });
    await waitFor(() => {
      expect(screen.queryByText('You are offline')).not.toBeOnTheScreen();
    });
  });
});
