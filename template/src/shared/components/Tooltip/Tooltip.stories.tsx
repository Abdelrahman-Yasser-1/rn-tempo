import type { Meta, StoryObj } from '@storybook/react-native';

import { Box } from '../Box';
import { Icon } from '../Icon';

import { Tooltip } from './Tooltip';

const meta = {
  title: 'Display/Tooltip',
  component: Tooltip,
  args: {
    content: 'Ten digits, starting with 1 or 2.',
    placement: 'top',
    accessibilityLabel: 'Show hint',
    children: <Icon name="info" />,
  },
  argTypes: { placement: { control: 'select', options: ['top', 'bottom'] } },
  render: (args) => (
    <Box p="xxxl" align="center">
      <Tooltip {...args} />
    </Box>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Bottom: Story = { args: { placement: 'bottom' } };

export const OpenByDefault: Story = { args: { visible: true } };
