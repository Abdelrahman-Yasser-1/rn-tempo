import type { Meta, StoryObj } from '@storybook/react-native';

import { Box } from '../Box';
import { Text } from '../Text';

import { Row } from './Row';

const meta = {
  title: 'Primitives/Row',
  component: Row,
  args: { gap: 'md', align: 'center', justify: 'start' },
  argTypes: {
    align: { control: 'select', options: ['start', 'center', 'end', 'stretch', 'baseline'] },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'between', 'around', 'evenly'],
    },
    gap: { control: 'select', options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
  },
  render: (args) => (
    <Row {...args}>
      <Box p="md" bg="primaryContainer" radius="md">
        <Text>A</Text>
      </Box>
      <Box p="lg" bg="surfaceVariant" radius="md">
        <Text>B</Text>
      </Box>
      <Box p="sm" bg="primaryContainer" radius="md">
        <Text>C</Text>
      </Box>
    </Row>
  ),
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SpaceBetween: Story = { args: { justify: 'between' } };

export const Centered: Story = { args: { justify: 'center', align: 'center' } };
