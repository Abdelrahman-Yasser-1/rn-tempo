import type { Meta, StoryObj } from '@storybook/react-native';
import { useForm } from 'react-hook-form';

import { Button } from '../Button';
import { Column } from '../Column';

import { FormSlider } from './FormSlider';

type DemoValues = { field: number };

function Demo() {
  const { control, setError } = useForm<DemoValues>({
    defaultValues: { field: 20 },
  });

  return (
    <Column gap="md">
      <FormSlider
        control={control}
        name="field"
        label="Volume"
        min={0}
        max={100}
        step={5}
        showValue
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
  title: 'Inputs/FormSlider',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
