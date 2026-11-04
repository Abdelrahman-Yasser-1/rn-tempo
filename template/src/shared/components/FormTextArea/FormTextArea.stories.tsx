import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { FormTextArea } from './FormTextArea';

type FormValues = { notes: string };

function Demo() {
  const { control } = useForm<FormValues>({ defaultValues: { notes: '' } });
  return (
    <FormTextArea<FormValues, 'notes'>
      name="notes"
      control={control}
      label="Notes"
      maxLength={120}
      required
    />
  );
}

const meta = {
  title: 'Inputs/FormTextArea',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
