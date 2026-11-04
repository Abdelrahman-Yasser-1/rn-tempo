import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { TimeSlotPicker } from './TimeSlotPicker';
import type { TimeSlotPickerProps } from './types';

const SLOTS = [
  { value: '09:00' },
  { value: '10:00' },
  { value: '11:00', disabled: true },
  { value: '13:00' },
  { value: '14:30' },
  { value: '17:00' },
  { value: '18:30', label: 'Evening 6:30' },
];

function Stateful(args: TimeSlotPickerProps) {
  const [value, setValue] = useState(args.value);

  return <TimeSlotPicker {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/TimeSlotPicker',
  component: TimeSlotPicker,
  args: { label: 'Pickup slot', slots: SLOTS, onChange: action('onChange') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof TimeSlotPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: '13:00' } };

export const WithDate: Story = { args: { date: '2026-11-18' } };

export const NoSlots: Story = { args: { slots: [] } };

export const WithError: Story = { args: { errorText: 'Pick a slot.' } };

export const Disabled: Story = { args: { disabled: true, value: '13:00' } };
