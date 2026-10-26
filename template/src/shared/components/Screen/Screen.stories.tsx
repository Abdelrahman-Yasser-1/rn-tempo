import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '../Column';
import { Text } from '../Text';

import { Screen } from './Screen';

const meta = {
  title: 'Primitives/Screen',
  component: Screen,
  args: { preset: 'fixed', keyboardAware: false, statusBarStyle: 'auto', padding: 'lg' },
  argTypes: {
    preset: { control: 'select', options: ['fixed', 'scroll'] },
    statusBarStyle: { control: 'select', options: ['auto', 'light', 'dark'] },
    padding: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl'] },
    keyboardAware: { control: 'boolean' },
  },
  render: (args) => (
    <Screen {...args} testID="story-screen">
      <Text variant="h2">Screen</Text>
      <Text color="textSecondary">Content sits inside the safe area.</Text>
    </Screen>
  ),
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fixed: Story = {};

export const Scroll: Story = {
  args: { preset: 'scroll' },
  render: (args) => (
    <Screen {...args} testID="story-screen">
      <Column gap="md">
        {Array.from({ length: 30 }, (_, index) => (
          <Text key={index}>Row {index + 1}</Text>
        ))}
      </Column>
    </Screen>
  ),
};

export const KeyboardAware: Story = { args: { keyboardAware: true } };

export const LightStatusBar: Story = { args: { statusBarStyle: 'light' } };
