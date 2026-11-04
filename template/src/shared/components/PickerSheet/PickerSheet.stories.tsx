import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Button } from '../Button';
import { Text } from '../Text';

import { PickerSheet } from './PickerSheet';

function Demo() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <Button
        title="Open sheet"
        onPress={() => {
          setIsVisible(true);
        }}
      />
      <PickerSheet
        visible={isVisible}
        title="Pick something"
        onConfirm={action('onConfirm')}
        onClose={() => {
          setIsVisible(false);
        }}
      >
        <Text>Picker content</Text>
      </PickerSheet>
    </>
  );
}

const meta = {
  title: 'Inputs/PickerSheet',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
