import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { MultiSelect } from './MultiSelect';
import type { MultiSelectProps } from './types';

const OPTIONS = [
  { value: 'en', label: 'English', description: 'United Kingdom and United States' },
  { value: 'ar', label: 'Arabic', description: 'Modern Standard Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German', disabled: true },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
];

function Stateful(args: MultiSelectProps) {
  const [value, setValue] = useState(args.value);

  return <MultiSelect {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Inputs/MultiSelect',
  component: MultiSelect,
  args: {
    options: OPTIONS,
    value: [],
    label: 'Languages',
    disabled: false,
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithChips: Story = { args: { value: ['en', 'ar'] } };

export const Overflowing: Story = { args: { value: ['en', 'ar', 'fr', 'es'] } };

export const Searchable: Story = { args: { searchable: true, sheetTitle: 'Choose languages' } };

export const MaxSelected: Story = { args: { maxSelected: 2, value: ['en'] } };

export const WithHelper: Story = { args: { helperText: 'Pick every language you speak.' } };

export const WithError: Story = { args: { errorText: 'Pick at least one language.' } };

export const Disabled: Story = { args: { disabled: true, value: ['en'] } };

export const ReadOnly: Story = { args: { readOnly: true, value: ['en', 'ar'] } };

export const Labelled: Story = {
  args: { required: true, subLabel: '(shown in the app)', tooltip: 'Used to translate content.' },
};
