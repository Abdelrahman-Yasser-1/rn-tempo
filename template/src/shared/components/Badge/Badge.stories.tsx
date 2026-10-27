import type { Meta, StoryObj } from '@storybook/react-native';

import { Row } from '../Row';

import { Badge } from './Badge';
import type { BadgeVariant } from './types';

const VARIANTS: BadgeVariant[] = ['neutral', 'primary', 'success', 'warning', 'error', 'info'];

const meta = {
  title: 'Display/Badge',
  component: Badge,
  args: { label: 'New', variant: 'primary', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Row gap="sm" wrap>
      {VARIANTS.map((variant) => (
        <Badge key={variant} {...args} variant={variant} label={variant} />
      ))}
    </Row>
  ),
};

export const Counts: Story = {
  render: (args) => (
    <Row gap="sm">
      <Badge {...args} label={undefined} count={3} />
      <Badge {...args} label={undefined} count={120} variant="error" />
      <Badge {...args} label={undefined} count={7} size="sm" variant="error" />
    </Row>
  ),
};
