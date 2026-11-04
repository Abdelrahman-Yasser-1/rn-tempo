import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormCheckbox } from './FormCheckbox';

type DemoValues = { field: boolean };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { field: false },
  });

  return (
    <Column gap="md">
      <FormCheckbox control={control} name="field" label="I accept the terms" />
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
  title: 'Inputs/FormCheckbox',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
