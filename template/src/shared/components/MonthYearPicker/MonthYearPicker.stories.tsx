import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { MonthYearPicker } from './MonthYearPicker';
import type { MonthYearPickerProps } from './types';

function Stateful(args: MonthYearPickerProps) {
  const [value, setValue] = useState(args.value);

  return <MonthYearPicker {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/MonthYearPicker',
  component: MonthYearPicker,
  args: { label: 'Statement month', onChange: action('onChange') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof MonthYearPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: '2026-11' } };

export const Bounded: Story = { args: { minMonth: '2026-03', maxMonth: '2027-06' } };

export const WithError: Story = { args: { errorText: 'Pick a month.' } };

export const Disabled: Story = { args: { disabled: true, value: '2026-11' } };

export const ReadOnly: Story = { args: { readOnly: true, value: '2026-11' } };
