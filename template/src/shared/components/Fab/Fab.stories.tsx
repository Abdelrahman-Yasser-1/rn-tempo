import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Fab } from './Fab';

const meta = {
  title: 'Actions/Fab',
  component: Fab,
  args: { icon: 'plus', accessibilityLabel: 'Add item', onPress: action('onPress') },
} satisfies Meta<typeof Fab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Extended: Story = { args: { label: 'New item', accessibilityLabel: undefined } };
