import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect } from 'react';

import { useNetworkStore } from '@services/network/network';

import { ConnectionModal } from './ConnectionModal';
import type { ConnectionModalProps } from './types';

function Offline(args: ConnectionModalProps) {
  useEffect(() => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
    return () => {
      useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
    };
  }, []);

  return <ConnectionModal {...args} />;
}

const meta = {
  title: 'Overlays/ConnectionModal',
  component: ConnectionModal,
  args: { delayMs: 1500 },
  render: (args) => <Offline {...args} />,
} satisfies Meta<typeof ConnectionModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Simulates going offline; the modal opens after `delayMs`. */
export const OfflineLongerThanDelay: Story = {};

export const Disabled: Story = { args: { enabled: false } };
