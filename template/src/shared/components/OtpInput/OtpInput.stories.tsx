import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { OtpInput } from './OtpInput';
import type { OtpInputProps } from './types';

function Stateful(args: OtpInputProps) {
  const [value, setValue] = useState(args.value);

  return <OtpInput {...args} value={value} onChangeText={setValue} />;
}

const meta = {
  title: 'Inputs/OtpInput',
  component: OtpInput,
  args: {
    value: '',
    length: 6,
    disabled: false,
    errorText: '',
    onChangeText: action('onChangeText'),
    onComplete: action('onComplete'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof OtpInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const FourDigits: Story = { args: { length: 4 } };

export const Prefilled: Story = { args: { value: '123' } };

export const WithError: Story = { args: { value: '123456', errorText: 'Invalid code' } };

export const Disabled: Story = { args: { value: '1234', disabled: true } };
