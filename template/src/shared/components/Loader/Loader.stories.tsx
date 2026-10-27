import type { Meta, StoryObj } from '@storybook/react-native';

import { Loader } from './Loader';

const meta = {
  title: 'Feedback/Loader',
  component: Loader,
  args: { size: 'lg', fullScreen: false },
  argTypes: { size: { control: 'select', options: ['sm', 'lg'] } },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const WithLabel: Story = { args: { label: 'Loading your items' } };
