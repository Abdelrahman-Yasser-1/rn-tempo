import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '../Column';

import { Text } from './Text';

const VARIANTS = [
  'display',
  'h1',
  'h2',
  'h3',
  'title',
  'body',
  'bodyStrong',
  'bodySmall',
  'label',
  'caption',
  'button',
] as const;

const meta = {
  title: 'Primitives/Text',
  component: Text,
  args: { children: 'The quick brown fox', variant: 'body', color: 'textPrimary' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    align: { control: 'select', options: ['start', 'center', 'end'] },
    numberOfLines: { control: 'number' },
  },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <Column gap="sm">
      {VARIANTS.map((variant) => (
        <Text key={variant} {...args} variant={variant}>
          {variant}
        </Text>
      ))}
    </Column>
  ),
};

export const Colors: Story = {
  render: (args) => (
    <Column gap="xs">
      <Text {...args} color="textPrimary">
        textPrimary
      </Text>
      <Text {...args} color="textSecondary">
        textSecondary
      </Text>
      <Text {...args} color="textDisabled">
        textDisabled
      </Text>
      <Text {...args} color="primary">
        primary
      </Text>
      <Text {...args} color="error">
        error
      </Text>
      <Text {...args} color="success">
        success
      </Text>
    </Column>
  ),
};

export const Truncated: Story = {
  args: {
    numberOfLines: 2,
    children:
      'A long paragraph that is truncated after two lines so the ellipsis behaviour is visible in the canvas. More words follow to make sure it overflows.',
  },
};

export const Aligned: Story = {
  render: (args) => (
    <Column gap="xs">
      <Text {...args} align="start">
        start
      </Text>
      <Text {...args} align="center">
        center
      </Text>
      <Text {...args} align="end">
        end
      </Text>
    </Column>
  ),
};
