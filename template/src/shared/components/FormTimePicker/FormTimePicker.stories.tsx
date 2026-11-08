import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';

import { FormTimePicker } from './FormTimePicker';

type DemoValues = { field: string };

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: '' } });

  return (
    <Column gap="md">
      <FormTimePicker control={control} name="field" label="Pickup time" />
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
  title: 'Inputs/FormTimePicker',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
