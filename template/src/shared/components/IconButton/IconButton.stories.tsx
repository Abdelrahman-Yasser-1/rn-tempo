import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Row } from '../Row';

import { IconButton } from './IconButton';

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

const meta = {
  title: 'Inputs/IconButton',
  component: IconButton,
  args: {
    icon: 'plus',
    accessibilityLabel: 'Add item',
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    onPress: action('onPress'),
  },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'select', options: SIZES },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Row gap="md" align="center">
      {VARIANTS.map((variant) => (
        <IconButton key={variant} {...args} variant={variant} accessibilityLabel={variant} />
      ))}
    </Row>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <Row gap="md" align="center">
      {SIZES.map((size) => (
        <IconButton key={size} {...args} size={size} accessibilityLabel={`Size ${size}`} />
      ))}
    </Row>
  ),
};

export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = { args: { disabled: true } };
