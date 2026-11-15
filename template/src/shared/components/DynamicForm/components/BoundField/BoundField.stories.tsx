import type { Meta, StoryObj } from '@storybook/react-native';
import { FormProvider, useForm } from 'react-hook-form';

import type { BoundFormField } from '@shared/components/DynamicForm/components/FieldRegistry';
import { FormBuilderContext } from '@shared/components/DynamicForm/hooks/useFormBuilderContext';

import { BoundField } from './BoundField';

type Values = { email: string };

const context = {
  resets: new Map<string, unknown>(),
  asyncErrors: new Map<string, string>(),
  spacing: 'md',
} as const;
const defaultValues: Values = { email: '' };

const field: BoundFormField<Values> = {
  type: 'text',
  name: 'email',
  label: { en: 'Email', ar: 'البريد الإلكتروني' },
  helperText: { en: 'We never share it.', ar: 'لن نشاركه.' },
  required: true,
  props: { keyboardType: 'email-address', autoCapitalize: 'none' },
};

function Demo({ isVisible }: Readonly<{ isVisible: boolean }>) {
  const form = useForm<Values>({ defaultValues });
  return (
    <FormProvider {...form}>
      <FormBuilderContext value={context}>
        <BoundField field={field} values={defaultValues} isVisible={isVisible} />
      </FormBuilderContext>
    </FormProvider>
  );
}

const meta = {
  title: 'DynamicForm/BoundField',
  component: Demo,
  args: { isVisible: true },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Hidden: Story = { args: { isVisible: false } };
