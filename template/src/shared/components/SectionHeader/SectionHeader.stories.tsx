import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { SectionHeader } from './SectionHeader';

const meta = {
  title: 'Display/SectionHeader',
  component: SectionHeader,
  args: { title: 'Recent activity' },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithSubtitle: Story = { args: { subtitle: 'Last 7 days' } };

export const WithAction: Story = {
  args: { subtitle: 'Last 7 days', action: { label: 'See all', onPress: action('onAction') } },
};
