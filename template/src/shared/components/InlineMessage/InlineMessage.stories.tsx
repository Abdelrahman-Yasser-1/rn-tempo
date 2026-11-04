import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '../Column';

import { InlineMessage } from './InlineMessage';

const meta = {
  title: 'Display/InlineMessage',
  component: InlineMessage,
  args: {
    variant: 'info',
    title: 'Update available',
    description: 'A new version is ready to install.',
  },
  argTypes: { variant: { control: 'select', options: ['info', 'success', 'warning', 'error'] } },
} satisfies Meta<typeof InlineMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithActionAndClose: Story = {
  args: {
    action: { label: 'Learn more', onPress: action('onAction') },
    onClose: action('onClose'),
  },
};

export const Variants: Story = {
  render: (args) => (
    <Column gap="md">
      <InlineMessage {...args} variant="info" />
      <InlineMessage {...args} variant="success" title="Saved" />
      <InlineMessage {...args} variant="warning" title="Almost full" />
      <InlineMessage {...args} variant="error" title="Upload failed" />
    </Column>
  ),
};
