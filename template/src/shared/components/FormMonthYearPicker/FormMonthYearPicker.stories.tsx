import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormMonthYearPicker } from './FormMonthYearPicker';

type DemoValues = { field: string };

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: '' } });

  return (
    <Column gap="md">
      <FormMonthYearPicker control={control} name="field" label="Statement month" />
      <Button
        title="Show error"
        onPress={() => {
          setError('field', { message: 'username.required' });
        }}
      />
    </Column>
  );
}

const meta = {
  title: 'Inputs/FormMonthYearPicker',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
