import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { PickerField } from './PickerField';

const meta = {
  title: 'Inputs/PickerField',
  component: PickerField,
  args: {
    label: 'Date',
    placeholder: 'Select a date',
    icon: 'calendar',
    onPress: action('onPress'),
  },
} satisfies Meta<typeof PickerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithValue: Story = { args: { valueText: 'Nov 4, 2026' } };

export const WithError: Story = { args: { errorText: 'Pick a date.' } };

export const ReadOnly: Story = { args: { readOnly: true, valueText: 'Nov 4, 2026' } };

export const Disabled: Story = { args: { disabled: true } };
