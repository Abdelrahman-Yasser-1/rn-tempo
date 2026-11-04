import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { PhoneInput } from './PhoneInput';
import type { PhoneInputProps } from './types';

function Stateful(args: PhoneInputProps) {
  const [value, setValue] = useState(args.value);

  return (
    <PhoneInput
      {...args}
      value={value}
      onChange={(e164, details) => {
        setValue(e164);
        args.onChange(e164, details);
      }}
    />
  );
}

const meta = {
  title: 'Inputs/PhoneInput',
  component: PhoneInput,
  args: {
    value: '',
    label: 'Mobile number',
    placeholder: '5X XXX XXXX',
    disabled: false,
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof PhoneInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: '+966512345678' } };

export const OtherCountry: Story = { args: { value: '+201001234567' } };

export const WithHelper: Story = { args: { helperText: 'We send a code to this number.' } };

export const WithError: Story = { args: { errorText: 'Enter a valid phone number.' } };

export const Disabled: Story = { args: { disabled: true, value: '+966512345678' } };

export const ReadOnly: Story = { args: { readOnly: true, value: '+966512345678' } };

export const Labelled: Story = {
  args: { required: true, subLabel: '(for sign-in)', tooltip: 'Include no leading zero.' },
};
