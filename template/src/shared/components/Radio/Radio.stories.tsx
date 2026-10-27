import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { RadioGroup } from '../RadioGroup';

import { Radio } from './Radio';

function Demo({ isDisabled }: Readonly<{ isDisabled: boolean }>) {
  const [value, setValue] = useState<string | undefined>('b');

  return (
    <RadioGroup value={value} onChange={setValue} disabled={isDisabled}>
      <Radio value="a" label="Option A" />
      <Radio value="b" label="Option B" />
      <Radio value="c" label="Option C" disabled />
    </RadioGroup>
  );
}

const meta = {
  title: 'Inputs/Radio',
  component: Demo,
  args: { isDisabled: false },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const GroupDisabled: Story = { args: { isDisabled: true } };
