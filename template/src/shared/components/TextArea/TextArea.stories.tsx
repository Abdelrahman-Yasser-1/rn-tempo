import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '../Column';

import { TextArea } from './TextArea';

const meta = {
  title: 'Inputs/TextArea',
  component: TextArea,
  args: {
    label: 'Notes',
    placeholder: 'Write something',
    maxLength: 120,
    numberOfLines: 4,
    onChangeText: action('onChangeText'),
  },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: (args) => (
    <Column gap="lg">
      <TextArea {...args} required helperText="Keep it short." />
      <TextArea {...args} errorText="Notes are required." />
      <TextArea {...args} readOnly value="Read-only text that can still be selected." />
      <TextArea {...args} disabled value="Disabled" />
      <TextArea {...args} defaultValue="Starts with some text" />
    </Column>
  ),
};
