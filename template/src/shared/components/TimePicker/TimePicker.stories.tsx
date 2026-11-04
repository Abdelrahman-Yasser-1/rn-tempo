import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { TimePicker } from './TimePicker';
import type { TimePickerProps } from './types';

function Stateful(args: TimePickerProps) {
  const [value, setValue] = useState(args.value);

  return <TimePicker {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/TimePicker',
  component: TimePicker,
  args: { label: 'Pickup time', onChange: action('onChange') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof TimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: '14:30' } };

export const QuarterHours: Story = { args: { minuteInterval: 15 } };

export const WithError: Story = { args: { errorText: 'Pick a time.' } };

export const Disabled: Story = { args: { disabled: true, value: '14:30' } };

export const ReadOnly: Story = { args: { readOnly: true, value: '14:30' } };
