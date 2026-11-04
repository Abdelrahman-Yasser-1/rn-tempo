import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { MonthYearGrid } from './MonthYearGrid';
import type { MonthYearGridProps } from './types';

function Stateful(args: MonthYearGridProps) {
  const [selection, setSelection] = useState({ year: args.year, month: args.month });

  return (
    <MonthYearGrid
      {...args}
      year={selection.year}
      month={selection.month}
      onSelect={(year, month) => {
        setSelection({ year, month });
      }}
    />
  );
}

const meta = {
  title: 'Inputs/MonthYearGrid',
  component: MonthYearGrid,
  args: { year: 2026, month: 10, onSelect: action('onSelect') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof MonthYearGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Bounded: Story = { args: { minMonth: '2026-03', maxMonth: '2027-06' } };
