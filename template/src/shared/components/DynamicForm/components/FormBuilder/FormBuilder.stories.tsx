import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';
import { z } from 'zod';

import { Button } from '@shared/components/Button';
import type { FormField } from '@shared/components/DynamicForm/components/FieldRegistry';

import { FormBuilder } from './FormBuilder';

type Values = { name: string; hasPet: boolean; petName: string };

const label = (en: string) => ({ en, ar: en });

const fields: FormField<Values>[] = [
  { type: 'text', name: 'name', label: label('Your name'), required: true },
  { type: 'switch', name: 'hasPet', label: label('I have a pet') },
  {
    type: 'text',
    name: 'petName',
    label: label('Pet name'),
    visibleIf: (values) => values.hasPet,
    clearOnHidden: true,
  },
];

const schema = z.object({
  name: z.string().min(1, 'Enter your name'),
  hasPet: z.boolean(),
  petName: z.string(),
}) satisfies z.ZodType<Values, Record<string, unknown>>;

function Demo() {
  return (
    <FormBuilder<Values>
      fields={fields}
      schema={schema}
      onSubmit={action('onSubmit')}
      renderSubmitButton={(onPress) => <Button title="Submit" onPress={onPress} />}
    />
  );
}

const meta = {
  title: 'DynamicForm/FormBuilder',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
