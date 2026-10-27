import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Radio } from '../Radio';

import { RadioGroup } from './RadioGroup';

function Demo() {
  const [value, setValue] = useState<string | undefined>();

  return (
    <RadioGroup value={value} onChange={setValue} accessibilityLabel="Plan">
      <Radio value="free" label="Free" />
      <Radio value="pro" label="Pro" />
      <Radio value="team" label="Team" />
    </RadioGroup>
  );
}

const meta = {
  title: 'Inputs/RadioGroup',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
