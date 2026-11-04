import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Button } from '../Button';
import { Column } from '../Column';
import { Text } from '../Text';

import { DatePickerSheet } from './DatePickerSheet';

function Demo() {
  const [isVisible, setIsVisible] = useState(false);
  const [value, setValue] = useState<string>();

  return (
    <Column gap="md">
      <Button
        title="Open date sheet"
        onPress={() => {
          setIsVisible(true);
        }}
      />
      <Text>{value ?? 'No date'}</Text>
      <DatePickerSheet
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
  title: 'Inputs/DatePickerSheet',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
