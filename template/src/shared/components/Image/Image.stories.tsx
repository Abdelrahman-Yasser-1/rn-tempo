import type { Meta, StoryObj } from '@storybook/react-native';

import { Image } from './Image';

const meta = {
  title: 'Primitives/Image',
  component: Image,
  args: {
    source: { uri: 'https://picsum.photos/id/237/300/300' },
    width: 160,
    height: 160,
    radius: 'lg',
    accessibilityLabel: 'Sample photo',
  },
  argTypes: {
    radius: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl', 'full'] },
    resizeMode: { control: 'select', options: ['cover', 'contain', 'stretch', 'center'] },
    width: { control: 'number' },
    height: { control: 'number' },
  },
} satisfies Meta<typeof Image>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Circle: Story = { args: { radius: 'full' } };

export const BrokenSource: Story = {
  args: { source: { uri: 'https://invalid.example/missing.png' }, accessibilityLabel: 'Missing' },
};
