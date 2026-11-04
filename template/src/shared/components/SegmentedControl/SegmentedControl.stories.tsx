import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { SegmentedControl } from './SegmentedControl';
import type { SegmentedControlProps } from './types';

function Stateful(args: SegmentedControlProps) {
  const [value, setValue] = useState(args.value);
  return (
    <SegmentedControl
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
  title: 'Navigation/SegmentedControl',
  component: SegmentedControl,
  args: {
    items: [
      { key: 'day', label: 'Day' },
      { key: 'week', label: 'Week' },
      { key: 'month', label: 'Month' },
    ],
    value: 'day',
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const TwoSegments: Story = {
  args: {
    items: [
      { key: 'home', label: 'Home', icon: 'home' },
      { key: 'user', label: 'Profile', icon: 'user' },
    ],
    value: 'home',
  },
};
