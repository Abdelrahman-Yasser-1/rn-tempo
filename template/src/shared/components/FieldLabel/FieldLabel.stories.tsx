import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '@shared/components/Column';

import { FieldLabel } from './FieldLabel';

const meta = {
  title: 'Inputs/FieldLabel',
  component: FieldLabel,
  args: { label: 'National ID' },
} satisfies Meta<typeof FieldLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <Column gap="lg">
      <FieldLabel {...args} />
      <FieldLabel {...args} required />
      <FieldLabel {...args} subLabel="(optional)" />
      <FieldLabel {...args} required subLabel="As printed on the card" />
      <FieldLabel {...args} tooltip="Ten digits, starting with 1 or 2." />
    </Column>
  ),
};
