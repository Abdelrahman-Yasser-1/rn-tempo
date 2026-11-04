import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { Column } from '../Column';
import { Icon } from '../Icon';

import { ListItem } from './ListItem';

const meta = {
  title: 'Display/ListItem',
  component: ListItem,
  args: {
    title: 'Notifications',
    subtitle: 'Push and email',
    showChevron: false,
    showDivider: true,
  },
} satisfies Meta<typeof ListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Pressable: Story = {
  args: { onPress: action('onPress'), showChevron: true, left: <Icon name="settings" /> },
};

export const Variants: Story = {
  render: (args) => (
    <Column>
      <ListItem {...args} title="Plain row" subtitle={undefined} />
      <ListItem {...args} left={<Avatar name="Ada Lovelace" />} title="Ada Lovelace" />
      <ListItem {...args} right={<Badge count={4} variant="error" />} onPress={action('onPress')} />
      <ListItem {...args} disabled onPress={action('onPress')} title="Disabled" />
    </Column>
  ),
};

export const Layouts: Story = {
  render: (args) => (
    <Column>
      <ListItem {...args} layout="default" meta="12 Nov" />
      <ListItem {...args} layout="inline" meta="12 Nov" />
      <ListItem {...args} layout="stacked" meta="12 Nov" />
    </Column>
  ),
};

export const Slots: Story = {
  render: (args) => (
    <Column>
      <ListItem
        {...args}
        leading={{ type: 'icon', name: 'bell' }}
        trailing={{ type: 'text', text: 'On' }}
      />
      <ListItem
        {...args}
        leading={{ type: 'avatar', name: 'Ada Lovelace' }}
        trailing={{ type: 'badge', count: 2, variant: 'error' }}
      />
      <ListItem
        {...args}
        leading={{ type: 'image', source: { uri: 'https://picsum.photos/id/1011/96/96' } }}
        trailing={{ type: 'chevron' }}
        onPress={action('onPress')}
      />
    </Column>
  ),
};
