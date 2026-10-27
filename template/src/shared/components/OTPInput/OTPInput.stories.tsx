import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { OTPInput } from './OTPInput';
import type { OTPInputProps } from './types';

function Stateful(args: OTPInputProps) {
  const [value, setValue] = useState(args.value);

  return <OTPInput {...args} value={value} onChangeText={setValue} />;
}

const meta = {
  title: 'Inputs/OTPInput',
  component: OTPInput,
  args: {
    value: '',
    length: 6,
    disabled: false,
    errorText: '',
    onChangeText: action('onChangeText'),
    onComplete: action('onComplete'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof OTPInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const FourDigits: Story = { args: { length: 4 } };

export const Prefilled: Story = { args: { value: '123' } };

export const WithError: Story = { args: { value: '123456', errorText: 'Invalid code' } };

export const Disabled: Story = { args: { value: '1234', disabled: true } };
