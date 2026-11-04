import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormPhoneInput } from './FormPhoneInput';

type DemoValues = { field: string };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { field: '' },
  });

  return (
    <Column gap="md">
      <FormPhoneInput control={control} name="field" label="Mobile number" />
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
  title: 'Inputs/FormPhoneInput',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
