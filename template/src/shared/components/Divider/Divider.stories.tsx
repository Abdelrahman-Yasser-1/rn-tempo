import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '../Column';
import { Row } from '../Row';
import { Text } from '../Text';

import { Divider } from './Divider';

const meta = {
  title: 'Primitives/Divider',
  component: Divider,
  args: { orientation: 'horizontal', color: 'divider', spacing: 'md' },
  argTypes: {
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
    color: { control: 'select', options: ['divider', 'border', 'primary'] },
    spacing: { control: 'select', options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
  },
  render: (args) => (
    <Column p="md" bg="surface">
      <Text>Above</Text>
      <Divider {...args} />
      <Text>Below</Text>
    </Column>
  ),
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <Row p="md" bg="surface" align="stretch">
      <Text>Left</Text>
      <Divider {...args} />
      <Text>Right</Text>
    </Row>
  ),
};
