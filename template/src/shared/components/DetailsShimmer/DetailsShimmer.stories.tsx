import type { Meta, StoryObj } from '@storybook/react-native';

import { DetailsShimmer } from './DetailsShimmer';

const meta = {
  title: 'Feedback/DetailsShimmer',
  component: DetailsShimmer,
} satisfies Meta<typeof DetailsShimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
