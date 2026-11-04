import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { FilterBar } from './FilterBar';
import type { FilterBarProps } from './types';

function Stateful(args: FilterBarProps) {
  const [selected, setSelected] = useState(args.selected);
  return (
    <FilterBar
      {...args}
      selected={selected}
      filterCount={selected.length}
      onToggle={(key) => {
        setSelected((current) =>
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
        );
        args.onToggle(key);
      }}
    />
  );
}

const meta = {
  title: 'Navigation/FilterBar',
  component: FilterBar,
  args: {
    filters: [
      { key: 'open', label: 'Open' },
      { key: 'done', label: 'Done' },
      { key: 'mine', label: 'Assigned to me', icon: 'check' },
      { key: 'urgent', label: 'Urgent' },
      { key: 'archived', label: 'Archived' },
    ],
    selected: ['open'],
    onToggle: action('onToggle'),
    onFilterPress: action('onFilterPress'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithoutFilterButton: Story = { args: { onFilterPress: undefined } };
