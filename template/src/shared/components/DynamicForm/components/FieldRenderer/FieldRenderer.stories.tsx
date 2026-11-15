import type { Meta, StoryObj } from '@storybook/react-native';
import { FormProvider, useForm } from 'react-hook-form';

import type { FormField } from '@shared/components/DynamicForm/components/FieldRegistry';
import { FormBuilderContext } from '@shared/components/DynamicForm/hooks/useFormBuilderContext';

import { FieldRenderer } from './FieldRenderer';

type Values = { first: string; second: string; city: string };

const label = (en: string) => ({ en, ar: en });
const context = {
  resets: new Map<string, unknown>(),
  asyncErrors: new Map<string, string>(),
  spacing: 'md',
} as const;
const defaultValues: Values = { first: '', second: '', city: '' };

const group: FormField<Values> = {
  type: 'group',
  fields: [
    {
      type: 'row',
      fields: [
        { type: 'text', name: 'first', label: label('First name') },
        { type: 'text', name: 'second', label: label('Last name') },
      ],
    },
    { type: 'text', name: 'city', label: label('City') },
  ],
};

function Demo({ field }: Readonly<{ field: FormField<Values> }>) {
  const form = useForm<Values>({ defaultValues });
  return (
    <FormProvider {...form}>
      <FormBuilderContext value={context}>
        <FieldRenderer field={field} values={defaultValues} />
      </FormBuilderContext>
    </FormProvider>
  );
}

const meta = {
  title: 'DynamicForm/FieldRenderer',
  component: Demo,
  args: { field: group },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupWithRow: Story = {};

export const SingleField: Story = {
  args: { field: { type: 'text', name: 'city', label: label('City') } },
};
