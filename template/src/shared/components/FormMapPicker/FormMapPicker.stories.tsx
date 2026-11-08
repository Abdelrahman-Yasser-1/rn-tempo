import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';
import type { MapLocation } from '@shared/components/MapPicker';

import { FormMapPicker } from './FormMapPicker';

type DemoValues = { field: MapLocation | null };

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: null } });

  return (
    <Column gap="md">
      <FormMapPicker control={control} name="field" label="Pickup location" />
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
  title: 'Inputs/FormMapPicker',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
