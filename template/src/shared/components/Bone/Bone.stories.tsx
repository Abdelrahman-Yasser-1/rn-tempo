import type { Meta, StoryObj } from '@storybook/react-native';

import { Column } from '../Column';
import { Skeleton } from '../Skeleton';

import { Bone } from './Bone';

const meta = {
  title: 'Feedback/Bone',
  component: Bone,
  args: { width: '100%', height: 16, radius: 'md' },
  argTypes: { radius: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'full'] } },
  render: (args) => (
    <Skeleton>
      <Bone {...args} />
    </Skeleton>
  ),
} satisfies Meta<typeof Bone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Shapes: Story = {
  render: () => (
    <Skeleton>
      <Column gap="md">
        <Bone width={56} height={56} radius="full" />
        <Bone width="60%" height={20} />
        <Bone height={12} />
        <Bone width="80%" height={12} />
      </Column>
    </Skeleton>
  ),
};
