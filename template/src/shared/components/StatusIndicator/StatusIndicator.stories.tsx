import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '@shared/components/Column';

import { StatusIndicator } from './StatusIndicator';

const meta = {
  title: 'Display/StatusIndicator',
  component: StatusIndicator,
  args: { status: 'success', label: 'Active', size: 'md' },
  argTypes: {
    status: { control: 'select', options: ['success', 'warning', 'error', 'info', 'neutral'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStatuses: Story = {
  render: (args) => (
    <Column gap="md">
      <StatusIndicator {...args} status="success" label="Approved" />
      <StatusIndicator {...args} status="warning" label="Pending review" />
      <StatusIndicator {...args} status="error" label="Rejected" />
      <StatusIndicator {...args} status="info" label="In progress" />
      <StatusIndicator {...args} status="neutral" label="Draft" size="sm" />
    </Column>
  ),
};
