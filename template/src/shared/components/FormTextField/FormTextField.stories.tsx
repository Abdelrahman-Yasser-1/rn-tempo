import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormTextField } from './FormTextField';

type DemoValues = { email: string };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { email: '' },
  });

  return (
    <Column gap="md">
      <FormTextField control={control} name="email" label="Email" placeholder="you@example.com" />
      <Button
        title="Show error"
        onPress={() => {
          setError('email', { message: 'required' });
        }}
      />
    </Column>
  );
}

const meta = {
  title: 'Inputs/FormTextField',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
