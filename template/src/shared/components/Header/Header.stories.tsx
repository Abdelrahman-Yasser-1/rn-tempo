import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { IconButton } from '../IconButton';

import { Header } from './Header';

const meta = {
  title: 'Navigation/Header',
  component: Header,
  args: { title: 'Settings', onBack: action('onBack') },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithoutBack: Story = { render: (args) => <Header title={args.title} /> };

export const WithActions: Story = {
  args: {
    right: <IconButton icon="search" accessibilityLabel="Search" onPress={action('onSearch')} />,
  },
};
