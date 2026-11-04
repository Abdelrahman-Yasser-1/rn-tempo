import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Tabs } from './Tabs';
import type { TabsProps } from './types';

const ITEMS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open', badge: 3 },
  { key: 'done', label: 'Done', icon: 'check' },
  { key: 'archived', label: 'Archived' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'shared', label: 'Shared with me' },
] as const;

function Stateful(args: TabsProps) {
  const [value, setValue] = useState(args.value);
  return (
    <Tabs
      {...args}
      value={value}
      onChange={(key) => {
        setValue(key);
        args.onChange(key);
      }}
    />
  );
}

const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  args: { items: ITEMS, value: 'all', variant: 'underline', onChange: action('onChange') },
  argTypes: { variant: { control: 'select', options: ['underline', 'pill'] } },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Pill: Story = { args: { variant: 'pill' } };
