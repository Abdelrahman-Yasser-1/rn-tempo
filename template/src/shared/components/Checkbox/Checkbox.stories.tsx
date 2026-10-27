import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Checkbox } from './Checkbox';
import type { CheckboxProps } from './types';

function Stateful(args: CheckboxProps) {
  const [isChecked, setIsChecked] = useState(args.checked);

  return <Checkbox {...args} checked={isChecked} onChange={setIsChecked} />;
}

const meta = {
  title: 'Inputs/Checkbox',
  component: Checkbox,
  args: {
    checked: false,
    label: 'Accept the terms',
    disabled: false,
    onChange: action('onChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Checked: Story = { args: { checked: true } };

export const Disabled: Story = { args: { disabled: true, checked: true } };
