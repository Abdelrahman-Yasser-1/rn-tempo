import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { action } from 'storybook/actions';

import { Button } from '../Button';
import { Text } from '../Text';

import { BottomSheet } from './BottomSheet';
import type { BottomSheetProps } from './types';

function Stateful(args: BottomSheetProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <GestureHandlerRootView>
      <BottomSheetModalProvider>
        <Button
          title="Open sheet"
          onPress={() => {
            setIsVisible(true);
          }}
        />
        <BottomSheet
          {...args}
          visible={isVisible}
          onClose={() => {
            setIsVisible(false);
          }}
        >
          <Text color="textSecondary">Sheet content sized to fit.</Text>
        </BottomSheet>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const meta = {
  title: 'Overlays/BottomSheet',
  component: BottomSheet,
  args: { visible: false, title: 'Sheet title', onClose: action('onClose') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const FixedSnapPoint: Story = { args: { snapPoints: ['50%'] } };

export const NoTitle: Story = { args: { title: undefined } };
