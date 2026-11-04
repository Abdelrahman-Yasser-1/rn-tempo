import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Slider } from './Slider';
import type { SliderProps } from './types';

function Stateful(args: SliderProps) {
  const [value, setValue] = useState(args.value);

  return <Slider {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/Slider',
  component: Slider,
  args: {
    value: 40,
    min: 0,
    max: 100,
    step: 5,
    label: 'Volume',
    showValue: true,
    disabled: false,
    readOnly: false,
    onChange: action('onChange'),
    onChangeEnd: action('onChangeEnd'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Formatted: Story = {
  args: { formatValue: (value: number) => `${String(value)}%`, label: 'Battery' },
};

export const CustomRangeLabels: Story = { args: { minLabel: 'Quiet', maxLabel: 'Loud' } };

export const WithHelper: Story = { args: { helperText: 'Applies to all alerts.' } };

export const WithError: Story = { args: { errorText: 'Pick at least 10.' } };

export const Disabled: Story = { args: { disabled: true } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const Labelled: Story = {
  args: { required: true, subLabel: '(percent)', tooltip: 'How loud alerts sound.' },
};
