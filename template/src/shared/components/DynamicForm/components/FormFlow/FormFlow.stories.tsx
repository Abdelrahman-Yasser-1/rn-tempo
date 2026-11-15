import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { fromJson } from '@shared/components/DynamicForm/utils/fromJson';

import { FormFlow } from './FormFlow';

const label = (en: string) => ({ en, ar: en });

const result = fromJson({
  version: 1,
  id: 'story-flow',
  review: true,
  steps: [
    {
      id: 'about',
      title: label('About you'),
      fields: [
        {
          type: 'text',
          name: 'fullName',
          label: label('Full name'),
          rules: [{ rule: 'required' }],
        },
      ],
    },
    {
      id: 'consent',
      title: label('Consent'),
      fields: [{ type: 'checkbox', name: 'agree', label: label('I agree') }],
    },
  ],
});

if (!result.success) {
  throw new Error(`the story flow is not valid: ${result.issues.join(', ')}`);
}
const built = result.form;

const meta = {
  title: 'DynamicForm/FormFlow',
  component: FormFlow,
  args: {
    flow: built,
    onSubmit: action('onSubmit'),
  },
} satisfies Meta<typeof FormFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
