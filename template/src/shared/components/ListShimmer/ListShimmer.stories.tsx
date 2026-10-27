import type { Meta, StoryObj } from '@storybook/react-native';

import { ListShimmer } from './ListShimmer';

const meta = {
  title: 'Feedback/ListShimmer',
  component: ListShimmer,
  args: { count: 4 },
} satisfies Meta<typeof ListShimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
