import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Badge } from '@shared/components/Badge';
import { Column } from '@shared/components/Column';

import { UserCard } from './UserCard';

const meta = {
  title: 'Display/UserCard',
  component: UserCard,
  args: { name: 'Ada Lovelace', meta: ['Engineer', 'ada@example.com'] },
} satisfies Meta<typeof UserCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Pressable: Story = { args: { onPress: action('onPress') } };

export const WithTrailing: Story = {
  args: { trailing: <Badge label="Admin" variant="primary" /> },
};

export const Stacked: Story = {
  render: (args) => (
    <Column gap="lg">
      <UserCard {...args} />
      <UserCard {...args} name="Grace Hopper" meta={['Admiral']} onPress={action('onPress')} />
    </Column>
  ),
};
