import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';

import { FormDatePicker } from './FormDatePicker';

type DemoValues = { field: string };

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: '' } });

  return (
    <Column gap="md">
      <FormDatePicker control={control} name="field" label="Available from" />
      <Button
        title="Show error"
        onPress={() => {
          setError('field', { message: 'date.invalid' });
        }}
      />
    </Column>
  );
}

const meta = {
  title: 'Inputs/FormDatePicker',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
