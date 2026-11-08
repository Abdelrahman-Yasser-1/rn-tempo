import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import type { PickedFile } from '@services/files/types';
import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';

import { FormMultiFilePicker } from './FormMultiFilePicker';

type DemoValues = { field: PickedFile[] };

function Demo() {
  const { control, setError } = useForm<DemoValues>({ defaultValues: { field: [] } });

  return (
    <Column gap="md">
      <FormMultiFilePicker control={control} name="field" label="Attachment" />
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
  title: 'Inputs/FormMultiFilePicker',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
