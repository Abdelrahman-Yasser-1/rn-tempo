import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '../Column';
import { Icon } from '../Icon';

import { TextField } from './TextField';

const meta = {
  title: 'Inputs/TextField',
  component: TextField,
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
    helperText: '',
    errorText: '',
    disabled: false,
    secureTextEntry: false,
    onChangeText: action('onChangeText'),
  },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithHelper: Story = { args: { helperText: 'We never share your email.' } };

export const WithError: Story = { args: { errorText: 'Enter a valid email address.' } };

export const Disabled: Story = { args: { disabled: true, value: 'locked@example.com' } };

export const Password: Story = {
  args: { label: 'Password', placeholder: '', secureTextEntry: true, value: 'secret123' },
};

export const WithAdornments: Story = {
  render: (args) => (
    <Column gap="md">
      <TextField {...args} left={<Icon name="search" size={20} color="textSecondary" />} />
      <TextField {...args} right={<Icon name="check" size={20} color="success" />} />
    </Column>
  ),
};
