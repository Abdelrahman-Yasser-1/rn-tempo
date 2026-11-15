import type { Meta, StoryObj } from '@storybook/react-native';
import { FormProvider, useForm } from 'react-hook-form';

import type { RepeatFieldConfig } from '@shared/components/DynamicForm/components/FieldRegistry';

import { RepeatField } from './RepeatField';

type Values = { people: { name: string }[] };

const field: RepeatFieldConfig<Values> = {
  type: 'repeat',
  name: 'people',
  label: { en: 'People', ar: 'الأشخاص' },
  itemLabel: { en: 'Person', ar: 'شخص' },
  addLabel: { en: 'Add person', ar: 'إضافة شخص' },
  minItems: 1,
  maxItems: 3,
  fields: [{ type: 'text', name: 'name', label: { en: 'Name', ar: 'الاسم' } }],
};

function Demo({ isVisible }: Readonly<{ isVisible: boolean }>) {
  const form = useForm<Values>({ defaultValues: { people: [{ name: 'Ada' }] } });
  return (
    <FormProvider {...form}>
      <RepeatField field={field} isVisible={isVisible} />
    </FormProvider>
  );
}

const meta = {
  title: 'DynamicForm/RepeatField',
  component: Demo,
  args: { isVisible: true },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
