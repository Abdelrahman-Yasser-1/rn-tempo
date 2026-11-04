import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { toISODate } from '@shared/utils/calendar';

import { Calendar } from './Calendar';
import type { CalendarProps } from './types';

function Stateful(args: CalendarProps) {
  const [value, setValue] = useState(args.value);

  return <Calendar {...args} value={value} onChange={setValue} />;
}

const isWeekend = (iso: string) => {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 5 || day === 6;
};

const meta = {
  title: 'Inputs/Calendar',
  component: Calendar,
  args: { onChange: action('onChange') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: toISODate(new Date()) } };

export const Bounded: Story = {
  args: { minDate: '2026-11-05', maxDate: '2027-01-20', initialMonth: '2026-11' },
};

export const WeekendsDisabled: Story = { args: { isDateDisabled: isWeekend } };

export const MondayFirst: Story = { args: { firstDayOfWeek: 1 } };
