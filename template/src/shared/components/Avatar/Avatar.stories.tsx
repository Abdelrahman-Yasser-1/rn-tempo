import type { Meta, StoryObj } from '@storybook/react-native';

import { Row } from '../Row';

import { Avatar } from './Avatar';
import type { AvatarSize } from './types';

const SIZES: AvatarSize[] = ['sm', 'md', 'lg', 'xl'];

const meta = {
  title: 'Display/Avatar',
  component: Avatar,
  args: { name: 'Ada Lovelace', size: 'md' },
  argTypes: { size: { control: 'select', options: SIZES } },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <Row gap="md" align="center">
      {SIZES.map((size) => (
        <Avatar key={size} {...args} size={size} />
      ))}
    </Row>
  ),
};

export const WithImage: Story = {
  args: { source: { uri: 'https://i.pravatar.cc/200?img=12' }, size: 'lg' },
};

export const BrokenImageFallsBackToInitials: Story = {
  args: { source: { uri: 'https://invalid.invalid/none.png' }, size: 'lg' },
};
