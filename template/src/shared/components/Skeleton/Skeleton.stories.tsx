import type { Meta, StoryObj } from '@storybook/react-native';

import { Bone } from '../Bone';
import { Row } from '../Row';

import { Skeleton } from './Skeleton';

const meta = {
  title: 'Feedback/Skeleton',
  component: Skeleton,
  render: (args) => (
    <Skeleton {...args}>
      <Row gap="md" align="center">
        <Bone width={48} height={48} radius="full" />
        <Bone width="60%" height={16} />
      </Row>
    </Skeleton>
  ),
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
