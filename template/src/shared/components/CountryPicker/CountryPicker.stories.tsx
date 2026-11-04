import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { CountryPicker } from './CountryPicker';
import type { CountryPickerProps } from './types';

function Stateful(args: CountryPickerProps) {
  const [value, setValue] = useState(args.value);

  return (
    <CountryPicker
      {...args}
      value={value}
      onChange={(country) => {
        setValue(country.iso2);
      }}
    />
  );
}

const meta = {
  title: 'Inputs/CountryPicker',
  component: CountryPicker,
  args: {
    label: 'Country',
    disabled: false,
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof CountryPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing selected yet: shows the default country, Saudi Arabia. */
export const Playground: Story = {};

export const WithValue: Story = { args: { value: 'EG' } };

export const Compact: Story = { args: { compact: true, label: undefined, value: 'AE' } };

export const WithHelper: Story = { args: { helperText: 'Where you live.' } };

export const WithError: Story = { args: { errorText: 'Pick your country.' } };

export const Disabled: Story = { args: { disabled: true, value: 'EG' } };

export const ReadOnly: Story = { args: { readOnly: true, value: 'EG' } };

export const Labelled: Story = {
  args: { required: true, subLabel: '(for billing)', tooltip: 'Used for taxes.' },
};
