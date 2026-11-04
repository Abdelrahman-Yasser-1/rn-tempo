import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormTimeSlot } from './FormTimeSlot';

type DemoValues = { field: string };

const SLOTS = [{ value: '09:00' }, { value: '13:00' }, { value: '18:00' }];

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: '' } });

  return (
    <Column gap="md">
      <FormTimeSlot control={control} name="field" label="Pickup slot" slots={SLOTS} />
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
  title: 'Inputs/FormTimeSlot',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
