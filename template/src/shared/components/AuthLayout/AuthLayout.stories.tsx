import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Button } from '@shared/components/Button';
import { TextField } from '@shared/components/TextField';

import { AuthLayout } from './AuthLayout';

const meta = {
  title: 'Layout/AuthLayout',
  component: AuthLayout,
  args: {
    title: 'Sign in',
    subtitle: 'Welcome back.',
    children: (
      <>
        <TextField label="Username" value="" onChangeText={action('onChangeText')} />
        <Button title="Sign in" fullWidth onPress={action('onPress')} />
      </>
    ),
  },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithHeader: Story = {
  args: { headerTitle: 'Create account', onBack: action('onBack') },
};
