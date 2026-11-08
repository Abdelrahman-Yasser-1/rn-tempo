import type { Meta, StoryObj } from '@storybook/react-native';

import { ListLoadingMore } from './ListLoadingMore';

const meta = {
  title: 'Feedback/ListLoadingMore',
  component: ListLoadingMore,
} satisfies Meta<typeof ListLoadingMore>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomLabel: Story = { args: { label: 'Fetching more orders' } };
