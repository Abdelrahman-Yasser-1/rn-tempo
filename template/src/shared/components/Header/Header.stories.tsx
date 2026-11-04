import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '../Column';

import { Header } from './Header';
import type { HeaderAction } from './types';

const ACTIONS: HeaderAction[] = [
  { icon: 'search', accessibilityLabel: 'Search', onPress: action('onSearch') },
  { icon: 'bell', accessibilityLabel: 'Notifications', onPress: action('onNotifications') },
  { icon: 'settings', accessibilityLabel: 'Settings', onPress: action('onSettings') },
];

const meta = {
  title: 'Navigation/Header',
  component: Header,
  args: { title: 'Settings', variant: 'default', onBack: action('onBack') },
  argTypes: { variant: { control: 'select', options: ['default', 'transparent', 'onColor'] } },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithoutBack: Story = { render: (args) => <Header title={args.title} /> };

export const WithSubtitle: Story = { args: { subtitle: 'Account and privacy' } };

export const WithActions: Story = { args: { actions: ACTIONS.slice(0, 1) } };

export const ThreeActions: Story = { args: { actions: ACTIONS, subtitle: 'Up to three actions' } };

export const Variants: Story = {
  render: (args) => (
    <Column gap="md">
      <Header {...args} variant="default" actions={ACTIONS.slice(0, 2)} />
      <Header {...args} variant="transparent" actions={ACTIONS.slice(0, 2)} />
      <Header {...args} variant="onColor" actions={ACTIONS.slice(0, 2)} subtitle="On colour" />
    </Column>
  ),
};
