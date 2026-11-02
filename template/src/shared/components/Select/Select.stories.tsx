import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Select } from './Select';
import type { SelectProps } from './types';

const OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German', disabled: true },
  { value: 'es', label: 'Spanish' },
];

function Stateful(args: SelectProps) {
  const [value, setValue] = useState(args.value);

  return <Select {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/Select',
  component: Select,
  args: {
    options: OPTIONS,
    value: undefined,
    label: 'Language',
    disabled: false,
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithValue: Story = { args: { value: 'ar' } };

export const WithHelper: Story = { args: { helperText: 'Used for the app interface.' } };

export const WithError: Story = { args: { errorText: 'Pick a language.' } };

export const Disabled: Story = { args: { disabled: true, value: 'en' } };
