import type { Meta, StoryObj } from '@storybook/react-native';

import { Badge } from '../Badge';
import { Column } from '../Column';

import { KeyValueRow } from './KeyValueRow';

const meta = {
  title: 'Display/KeyValueRow',
  component: KeyValueRow,
  args: { label: 'National ID', value: '1012345678', layout: 'horizontal' },
  argTypes: { layout: { control: 'select', options: ['horizontal', 'vertical'] } },
} satisfies Meta<typeof KeyValueRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Vertical: Story = { args: { layout: 'vertical' } };

export const Layouts: Story = {
  render: (args) => (
    <Column>
      <KeyValueRow {...args} />
      <KeyValueRow {...args} label="Plan" value={<Badge label="Pro" variant="primary" />} />
      <KeyValueRow {...args} layout="vertical" label="Address" value="King Fahd Road, Riyadh" />
    </Column>
  ),
};
