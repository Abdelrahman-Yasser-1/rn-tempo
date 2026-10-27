import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { EmptyState } from './EmptyState';

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  args: {
    icon: 'search',
    title: 'No results',
    message: 'Try a different search term or clear the filters.',
  },
  argTypes: { icon: { control: 'select', options: ['search', 'info', 'plus', 'trash'] } },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithAction: Story = {
  args: { actionLabel: 'Clear filters', onAction: action('onAction') },
};

export const TitleOnly: Story = { args: { message: undefined } };
