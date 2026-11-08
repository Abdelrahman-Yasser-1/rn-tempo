import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';

import { FormNumberInput } from './FormNumberInput';

type DemoValues = { field: number };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { field: 1 },
  });

  return (
    <Column gap="md">
      <FormNumberInput control={control} name="field" label="Quantity" min={1} max={10} />
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
  title: 'Inputs/FormNumberInput',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
