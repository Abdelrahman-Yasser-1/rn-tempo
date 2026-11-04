import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '../Column';

import { FieldMessage } from './FieldMessage';

const meta = {
  title: 'Inputs/FieldMessage',
  component: FieldMessage,
  args: { message: 'We never share your email.', variant: 'helper' },
} satisfies Meta<typeof FieldMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Column gap="md">
      <FieldMessage {...args} variant="helper" />
      <FieldMessage {...args} variant="error" message="Enter a valid email address." />
    </Column>
  ),
};
