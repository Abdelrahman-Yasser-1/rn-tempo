import type { Meta, StoryObj } from '@storybook/react-native';

import { CardShimmer } from './CardShimmer';

const meta = {
  title: 'Feedback/CardShimmer',
  component: CardShimmer,
} satisfies Meta<typeof CardShimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
