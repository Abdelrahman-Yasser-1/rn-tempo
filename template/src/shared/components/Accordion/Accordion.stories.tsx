import type { Meta, StoryObj } from '@storybook/react-native';

import { Text } from '../Text';

import { Accordion } from './Accordion';

const meta = {
  title: 'Display/Accordion',
  component: Accordion,
  args: {
    allowMultiple: false,
    items: [
      { key: 'a', title: 'Shipping', subtitle: 'Times and costs', content: <Text>Two days.</Text> },
      { key: 'b', title: 'Returns', icon: 'info', content: <Text>Thirty days.</Text> },
      { key: 'c', title: 'Warranty', content: <Text>One year.</Text>, disabled: true },
    ],
  },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const MultipleOpen: Story = {
  args: { allowMultiple: true, defaultExpandedKeys: ['a', 'b'] },
};
