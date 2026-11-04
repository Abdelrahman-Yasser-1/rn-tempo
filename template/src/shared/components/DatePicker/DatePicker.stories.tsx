import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { DatePicker } from './DatePicker';
import type { DatePickerProps } from './types';

function Stateful(args: DatePickerProps) {
  const [value, setValue] = useState(args.value);

  return <DatePicker {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/DatePicker',
  component: DatePicker,
  args: { label: 'Available from', onChange: action('onChange') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: '2026-11-04' } };

export const Bounded: Story = { args: { minDate: '2026-11-05', maxDate: '2027-02-01' } };

export const WithError: Story = { args: { errorText: 'Pick a date.' } };

export const Disabled: Story = { args: { disabled: true, value: '2026-11-04' } };

export const ReadOnly: Story = { args: { readOnly: true, value: '2026-11-04' } };
