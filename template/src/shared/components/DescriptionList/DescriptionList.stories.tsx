import type { Meta, StoryObj } from '@storybook/react-native';

import { Badge } from '@shared/components/Badge';

import { DescriptionList } from './DescriptionList';

const meta = {
  title: 'Display/DescriptionList',
  component: DescriptionList,
  args: {
    dividers: true,
    layout: 'horizontal',
    items: [
      { key: 'name', label: 'Full name', value: 'Ada Lovelace' },
      { key: 'id', label: 'National ID', value: '1012345678' },
      { key: 'plan', label: 'Plan', value: <Badge label="Pro" variant="primary" /> },
    ],
  },
  argTypes: { layout: { control: 'select', options: ['horizontal', 'vertical'] } },
} satisfies Meta<typeof DescriptionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Vertical: Story = { args: { layout: 'vertical' } };

export const WithoutDividers: Story = { args: { dividers: false } };
