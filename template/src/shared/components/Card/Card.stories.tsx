import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '../Column';
import { Text } from '../Text';

import { Card } from './Card';
import type { CardVariant } from './types';

const VARIANTS: CardVariant[] = ['elevated', 'outlined', 'filled'];

const meta = {
  title: 'Display/Card',
  component: Card,
  args: { variant: 'elevated', padding: 'lg' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    padding: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl'] },
  },
  render: (args) => (
    <Card {...args}>
      <Text variant="title">Card title</Text>
      <Text color="textSecondary">Supporting text inside the card.</Text>
    </Card>
  ),
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Column gap="md">
      {VARIANTS.map((variant) => (
        <Card key={variant} {...args} variant={variant}>
          <Text variant="title">{variant}</Text>
        </Card>
      ))}
    </Column>
  ),
};

export const Pressable: Story = {
  args: { onPress: action('onPress'), accessibilityLabel: 'Open details' },
};
