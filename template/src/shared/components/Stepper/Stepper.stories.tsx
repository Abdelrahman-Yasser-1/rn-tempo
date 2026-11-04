import type { Meta, StoryObj } from '@storybook/react-native';

import { Stepper } from './Stepper';

const meta = {
  title: 'Navigation/Stepper',
  component: Stepper,
  args: {
    steps: [
      { key: 'account', label: 'Account' },
      { key: 'profile', label: 'Profile' },
      { key: 'review', label: 'Review' },
    ],
    current: 1,
    variant: 'numbered',
  },
  argTypes: { variant: { control: 'select', options: ['numbered', 'progress'] } },
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Progress: Story = { args: { variant: 'progress' } };
