import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '../Column';
import { Text } from '../Text';

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

export const CustomFallback: Story = {
  args: {
    source: { uri: 'https://invalid.example/missing.png' },
    accessibilityLabel: 'Missing',
    fallback: <Text>No photo</Text>,
  },
};

/** The shimmer shows until the image loads; a slow network makes it easy to see. */
export const LoadingState: Story = {
  render: (args) => (
    <Column gap="md">
      <Image {...args} source={{ uri: 'https://httpbin.org/delay/8' }} />
    </Column>
  ),
};
