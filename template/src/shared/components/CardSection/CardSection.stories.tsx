import type { Meta, StoryObj } from '@storybook/react-native';

import { Card } from '@shared/components/Card';
import { Text } from '@shared/components/Text';

import { CardSection } from './CardSection';

const meta = {
  title: 'Display/CardSection',
  component: CardSection,
  args: { padding: 'lg', divider: false },
  argTypes: { padding: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl'] } },
} satisfies Meta<typeof CardSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <Card padding="none">
      <CardSection {...args}>
        <Text variant="title">Section</Text>
      </CardSection>
    </Card>
  ),
};

export const Dividers: Story = {
  render: (args) => (
    <Card padding="none">
      <CardSection {...args}>
        <Text variant="title">Order #1042</Text>
      </CardSection>
      <CardSection {...args} divider>
        <Text color="textSecondary">Delivered on 3 Nov</Text>
      </CardSection>
      <CardSection {...args} divider padding="md">
        <Text color="textSecondary">Compact footer</Text>
      </CardSection>
    </Card>
  ),
};
