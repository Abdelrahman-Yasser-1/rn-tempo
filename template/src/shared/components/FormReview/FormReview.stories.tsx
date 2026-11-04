import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { FormReview } from './FormReview';

const meta = {
  title: 'Forms/FormReview',
  component: FormReview,
  args: {
    sections: [
      {
        key: 'account',
        title: 'Account',
        items: [
          { key: 'name', label: 'Name', value: 'Ada Lovelace' },
          { key: 'email', label: 'Email', value: 'ada@example.com' },
        ],
      },
      { key: 'plan', title: 'Plan', items: [{ key: 'tier', label: 'Tier', value: 'Pro' }] },
    ],
    onEdit: action('onEdit'),
  },
} satisfies Meta<typeof FormReview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Vertical: Story = { args: { layout: 'vertical' } };
