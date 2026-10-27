import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Switch } from './Switch';
import type { SwitchProps } from './types';

function Stateful(args: SwitchProps) {
  const [isOn, setIsOn] = useState(args.value);

  return <Switch {...args} value={isOn} onValueChange={setIsOn} />;
}

const meta = {
  title: 'Inputs/Switch',
  component: Switch,
  args: {
    value: false,
    label: 'Notifications',
    disabled: false,
    onValueChange: action('onValueChange'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const On: Story = { args: { value: true } };

export const Disabled: Story = { args: { disabled: true, value: true } };
