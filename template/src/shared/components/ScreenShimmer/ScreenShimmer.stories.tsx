import type { Meta, StoryObj } from '@storybook/react-native';

import { ScreenShimmer } from './ScreenShimmer';

const meta = {
  title: 'Feedback/ScreenShimmer',
  component: ScreenShimmer,
  args: { cardCount: 3 },
} satisfies Meta<typeof ScreenShimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
