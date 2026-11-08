import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Column } from '@shared/components/Column';

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
    labelPosition: 'start',
    disabled: false,
    onValueChange: action('onValueChange'),
  },
  argTypes: { labelPosition: { control: 'select', options: ['start', 'end'] } },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const On: Story = { args: { value: true } };

export const Disabled: Story = { args: { disabled: true, value: true } };

export const LabelPosition: Story = {
  render: (args) => (
    <Column gap="md">
      <Stateful {...args} labelPosition="start" label="Label at start" />
      <Stateful {...args} labelPosition="end" label="Label at end" />
    </Column>
  ),
};
