import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '@shared/components/Button';
import { Column } from '@shared/components/Column';
import { Radio } from '@shared/components/Radio';

import { FormRadioGroup } from './FormRadioGroup';

type DemoValues = { field: string };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { field: '' },
  });

  return (
    <Column gap="md">
      <FormRadioGroup control={control} name="field" label="Plan">
        <Radio value="free" label="Free" />
        <Radio value="pro" label="Pro" />
      </FormRadioGroup>
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
  title: 'Inputs/FormRadioGroup',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
