import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '../Column';

import { Button } from './Button';
import type { ButtonSize, ButtonVariant } from './types';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

const meta = {
  title: 'Inputs/Button',
  component: Button,
  args: {
    title: 'Continue',
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    fullWidth: false,
    onPress: action('onPress'),
  },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'select', options: SIZES },
    leftIcon: { control: 'select', options: [undefined, 'plus', 'search', 'refresh', 'trash'] },
    rightIcon: { control: 'select', options: [undefined, 'chevron-right', 'check', 'close'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Column gap="md" align="start">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant} title={variant} />
      ))}
    </Column>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <Column gap="md" align="start">
      {SIZES.map((size) => (
        <Button key={size} {...args} size={size} title={`Size ${size}`} />
      ))}
    </Column>
  ),
};

export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = {
  render: (args) => (
    <Column gap="md" align="start">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant} title={variant} disabled />
      ))}
    </Column>
  ),
};

export const WithIcons: Story = { args: { leftIcon: 'plus', rightIcon: 'chevron-right' } };

export const FullWidth: Story = { args: { fullWidth: true } };
