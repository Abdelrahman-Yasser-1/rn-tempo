import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';

import { FormMultiSelect } from './FormMultiSelect';

type DemoValues = { field: string[] };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { field: [] },
  });

  return (
    <Column gap="md">
      <FormMultiSelect
        control={control}
        name="field"
        label="Tags"
        options={[
          { value: 'new', label: 'New' },
          { value: 'sale', label: 'Sale' },
        ]}
      />
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
  title: 'Inputs/FormMultiSelect',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
