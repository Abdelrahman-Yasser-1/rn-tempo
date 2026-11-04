import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Button } from '../Button';
import { Column } from '../Column';
import { Text } from '../Text';

import { TimePickerSheet } from './TimePickerSheet';

function Demo() {
  const [isVisible, setIsVisible] = useState(false);
  const [value, setValue] = useState<string>();

  return (
    <Column gap="md">
      <Button
        title="Open time sheet"
        onPress={() => {
          setIsVisible(true);
        }}
      />
      <Text>{value ?? 'No time'}</Text>
      <TimePickerSheet
        visible={isVisible}
        value={value}
        onConfirm={setValue}
        onClose={() => {
          setIsVisible(false);
        }}
      />
    </Column>
  );
}

const meta = {
  title: 'Inputs/TimePickerSheet',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
