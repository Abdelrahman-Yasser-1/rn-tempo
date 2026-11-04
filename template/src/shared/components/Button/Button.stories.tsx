import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Box } from '../Box';
import { Column } from '../Column';
import { Row } from '../Row';

import { Button } from './Button';
import type { ButtonSize, ButtonVariant } from './types';

const VARIANTS: ButtonVariant[] = [
  'primary',
  'neutral',
  'secondary',
  'outline',
  'outlineOnColor',
  'subtle',
  'ghost',
  'danger',
  'dangerOutline',
  'dangerSubtle',
  'dangerGhost',
  'link',
];
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
    icon: { control: 'select', options: [undefined, 'plus', 'search', 'refresh', 'trash'] },
    iconPosition: { control: 'select', options: ['start', 'end'] },
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

export const WithIcons: Story = {
  render: (args) => (
    <Column gap="md" align="start">
      <Button {...args} icon="plus" iconPosition="start" title="Icon at start" />
      <Button {...args} icon="chevron-right" iconPosition="end" title="Icon at end" />
      <Button {...args} icon="refresh" loading title="Loading replaces the icon" />
    </Column>
  ),
};

/** Solid and tinted fills; `outlineOnColor` is meant for a primary-coloured background. */
export const OnColor: Story = {
  render: (args) => (
    <Box p="lg" bg="primary">
      <Button {...args} variant="outlineOnColor" title="Outline on colour" />
    </Box>
  ),
};

export const DisabledAndLoading: Story = {
  render: (args) => (
    <Column gap="sm" align="start">
      {VARIANTS.map((variant) => (
        <Row key={variant} gap="sm">
          <Button {...args} variant={variant} title={`${variant} disabled`} disabled />
          <Button {...args} variant={variant} title="loading" loading />
        </Row>
      ))}
    </Column>
  ),
};

export const FullWidth: Story = { args: { fullWidth: true } };
