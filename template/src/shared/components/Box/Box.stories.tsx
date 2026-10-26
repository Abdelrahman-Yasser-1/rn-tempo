import type { Meta, StoryObj } from '@storybook/react-native';

import { Text } from '../Text';

import { Box } from './Box';

const meta = {
  title: 'Primitives/Box',
  component: Box,
  args: { p: 'lg', bg: 'surface', radius: 'md', gap: 'sm' },
  argTypes: {
    p: { control: 'select', options: ['none', 'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'] },
    gap: { control: 'select', options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
    radius: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl', 'full'] },
    bg: {
      control: 'select',
      options: ['surface', 'surfaceVariant', 'primaryContainer', 'background'],
    },
    align: { control: 'select', options: ['start', 'center', 'end', 'stretch', 'baseline'] },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'between', 'around', 'evenly'],
    },
    direction: { control: 'select', options: ['row', 'column'] },
  },
  render: (args) => (
    <Box {...args}>
      <Text>First child</Text>
      <Text color="textSecondary">Second child</Text>
    </Box>
  ),
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Row: Story = { args: { direction: 'row', justify: 'between' } };

export const Padded: Story = { args: { p: 'xl', bg: 'primaryContainer', radius: 'xl' } };

export const Pill: Story = { args: { px: 'lg', py: 'xs', radius: 'full', align: 'center' } };
