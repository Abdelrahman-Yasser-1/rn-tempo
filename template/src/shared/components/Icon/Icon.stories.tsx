import type { Meta, StoryObj } from '@storybook/react-native';

import { Icon } from './Icon';

const meta = {
  title: 'Primitives/Icon',
  component: Icon,
  args: { name: 'home', size: 'lg', color: 'textPrimary' },
  argTypes: {
    // Every icon is an option (see Icon/Gallery); a select of ~1,900 names would be unusable.
    name: { control: 'text' },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    color: {
      control: 'select',
      options: ['textPrimary', 'textSecondary', 'primary', 'error', 'success', 'warning'],
    },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Labelled: Story = { args: { name: 'info', accessibilityLabel: 'Information' } };
