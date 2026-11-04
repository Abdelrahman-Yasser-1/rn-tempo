import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { NumberInput } from './NumberInput';
import type { NumberInputProps } from './types';

function Stateful(args: NumberInputProps) {
  const [value, setValue] = useState(args.value);

  return <NumberInput {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/NumberInput',
  component: NumberInput,
  args: {
    value: 2,
    label: 'Quantity',
    min: 0,
    max: 10,
    step: 1,
    disabled: false,
    readOnly: false,
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof NumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AtMinimum: Story = { args: { value: 0 } };

export const AtMaximum: Story = { args: { value: 10 } };

export const Stepped: Story = { args: { value: 50, step: 25, min: 0, max: 100 } };

export const Formatted: Story = {
  args: { formatValue: (value: number) => `${String(value)} kg`, label: 'Weight' },
};

export const WithHelper: Story = { args: { helperText: 'Up to 10 per order.' } };

export const WithError: Story = { args: { errorText: 'Choose at least 1.' } };

export const Disabled: Story = { args: { disabled: true } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const Labelled: Story = {
  args: { required: true, subLabel: '(per order)', tooltip: 'How many items to order.' },
};
