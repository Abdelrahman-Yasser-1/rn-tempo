import type { Meta, StoryObj } from '@storybook/react-native';

import { Timeline } from './Timeline';

const meta = {
  title: 'Display/Timeline',
  component: Timeline,
  args: {
    items: [
      { key: 'placed', title: 'Order placed', timestamp: '12 Nov, 10:30', status: 'done' },
      { key: 'packed', title: 'Packed', description: 'Ready at the warehouse', status: 'done' },
      { key: 'shipped', title: 'Shipped', description: 'On its way', status: 'current' },
      { key: 'delivered', title: 'Delivered', status: 'upcoming' },
    ],
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
