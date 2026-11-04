import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Text } from '../Text';

import { StepperLayout } from './StepperLayout';

const meta = {
  title: 'Layout/StepperLayout',
  component: StepperLayout,
  args: {
    title: 'Create account',
    steps: [
      { key: 'account', label: 'Account', content: <Text>Account details go here.</Text> },
      { key: 'profile', label: 'Profile', content: <Text>Profile details go here.</Text> },
      { key: 'review', label: 'Review', content: <Text>Review your answers.</Text> },
    ],
    onExit: action('onExit'),
    onSubmit: action('onSubmit'),
  },
} satisfies Meta<typeof StepperLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ProgressBar: Story = { args: { variant: 'progress' } };

export const Complete: Story = {
  args: {
    isComplete: true,
    success: {
      title: 'Account created',
      message: 'You can now sign in.',
      doneLabel: 'Done',
      onDone: action('onDone'),
    },
  },
};
