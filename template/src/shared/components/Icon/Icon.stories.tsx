import type { Meta, StoryObj } from '@storybook/react-native';

import { ICONS } from '@assets/generated/icons.registry';

import { Box } from '../Box';
import { Text } from '../Text';

import { Icon } from './Icon';
import type { IconName } from './types';

const ICON_NAMES = Object.keys(ICONS) as IconName[];

const meta = {
  title: 'Primitives/Icon',
  component: Icon,
  args: { name: 'home', size: 'lg', color: 'textPrimary' },
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
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

export const Gallery: Story = {
  render: (args) => (
    <Box direction="row" wrap gap="lg" p="md">
      {ICON_NAMES.map((name) => (
        <Box key={name} align="center" gap="xs">
          <Icon {...args} name={name} />
          <Text variant="caption" color="textSecondary">
            {name}
          </Text>
        </Box>
      ))}
    </Box>
  ),
};
