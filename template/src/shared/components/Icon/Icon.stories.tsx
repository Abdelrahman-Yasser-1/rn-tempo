import type { Meta, StoryObj } from '@storybook/react-native';

import { icons } from '@assets/icons';

import { Box } from '../Box';
import { Text } from '../Text';

import { Icon } from './Icon';
import type { IconName } from './types';

const ICON_NAMES = Object.keys(icons) as IconName[];

const meta = {
  title: 'Primitives/Icon',
  component: Icon,
  args: { name: 'home', size: 24, color: 'textPrimary' },
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
    size: { control: 'number' },
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
