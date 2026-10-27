import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect } from 'react';

import { useNetworkStore } from '@services/network/network';

import { OfflineBanner } from './OfflineBanner';
import type { OfflineBannerProps } from './types';

function Offline(args: OfflineBannerProps) {
  useEffect(() => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
    return () => {
      useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
    };
  }, []);

  return <OfflineBanner {...args} />;
}

const meta = {
  title: 'Feedback/OfflineBanner',
  component: OfflineBanner,
  render: (args) => <Offline {...args} />,
} satisfies Meta<typeof OfflineBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Forces the network store offline so the banner is visible. */
export const ForcedOffline: Story = {};

export const CustomMessage: Story = {
  args: { message: 'You are offline. Changes will sync later.' },
};
