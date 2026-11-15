import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import type { StepConfig } from '@shared/components/DynamicForm/components/FieldRegistry';

import { ReviewStep } from './ReviewStep';

type Values = { name: string; email: string; subscribe: boolean };

const label = (en: string) => ({ en, ar: en });

const steps: StepConfig<Values>[] = [
  {
    id: 'about',
    title: label('About you'),
    fields: [
      { type: 'text', name: 'name', label: label('Name') },
      { type: 'text', name: 'email', label: label('Email') },
    ],
  },
  {
    id: 'prefs',
    title: label('Preferences'),
    fields: [{ type: 'switch', name: 'subscribe', label: label('Subscribe') }],
  },
];

const meta = {
  title: 'DynamicForm/ReviewStep',
  component: ReviewStep<Values>,
  args: {
    steps,
    values: { name: 'Ada Lovelace', email: 'ada@example.com', subscribe: true },
    onEdit: action('onEdit'),
  },
} satisfies Meta<typeof ReviewStep<Values>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
