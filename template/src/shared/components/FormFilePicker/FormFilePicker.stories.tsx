import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import type { PickedFile } from '@services/files/types';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormFilePicker } from './FormFilePicker';

type DemoValues = { field: PickedFile | null };

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: null } });

  return (
    <Column gap="md">
      <FormFilePicker control={control} name="field" label="Attachment" />
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
  title: 'Inputs/FormFilePicker',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
