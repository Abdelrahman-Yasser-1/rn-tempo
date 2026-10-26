import type { Meta, StoryObj } from '@storybook/react-native';

import { Box } from '../Box';
import { Row } from '../Row';
import { Text } from '../Text';

import { Spacer } from './Spacer';

const meta = {
  title: 'Primitives/Spacer',
  component: Spacer,
  args: { size: 'lg' },
  argTypes: {
    size: {
      control: 'select',
      options: ['none', 'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'],
    },
    horizontal: { control: 'boolean' },
  },
  render: (args) => (
    <Box p="md" bg="surface">
      <Text>Above</Text>
      <Spacer {...args} />
      <Text>Below</Text>
    </Box>
  ),
} satisfies Meta<typeof Spacer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Horizontal: Story = {
  args: { horizontal: true, size: 'xl' },
  render: (args) => (
    <Row p="md" bg="surface">
      <Text>Left</Text>
      <Spacer {...args} />
      <Text>Right</Text>
    </Row>
  ),
};
