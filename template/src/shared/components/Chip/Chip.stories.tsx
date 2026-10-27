import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Row } from '../Row';

import { Chip } from './Chip';
import type { ChipProps } from './types';

function Stateful(args: ChipProps) {
  const [isSelected, setIsSelected] = useState(args.selected ?? false);

  return (
    <Chip
      {...args}
      selected={isSelected}
      onPress={() => {
        setIsSelected((isOn) => !isOn);
      }}
    />
  );
}

const meta = {
  title: 'Inputs/Chip',
  component: Chip,
  args: { label: 'Design', selected: false, disabled: false },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Selected: Story = { args: { selected: true } };

export const WithIcon: Story = { args: { leftIcon: 'check' } };

export const Disabled: Story = { args: { disabled: true } };

export const Group: Story = {
  render: (args) => (
    <Row gap="sm" wrap>
      {['Design', 'Code', 'Docs', 'Tests'].map((label) => (
        <Stateful key={label} {...args} label={label} />
      ))}
    </Row>
  ),
};
