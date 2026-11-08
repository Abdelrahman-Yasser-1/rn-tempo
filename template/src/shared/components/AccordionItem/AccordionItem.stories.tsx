import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '@shared/components/Column';
import { Text } from '@shared/components/Text';

import { AccordionItem } from './AccordionItem';

const meta = {
  title: 'Display/AccordionItem',
  component: AccordionItem,
  args: {
    title: 'Shipping',
    subtitle: 'Delivery times and costs',
    onToggle: action('onToggle'),
    children: <Text>Orders ship within two working days.</Text>,
  },
} satisfies Meta<typeof AccordionItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Expanded: Story = { args: { defaultExpanded: true, icon: 'info' } };

export const Disabled: Story = { args: { disabled: true } };

export const Stacked: Story = {
  render: (args) => (
    <Column>
      <AccordionItem {...args} icon="info" />
      <AccordionItem {...args} title="Returns" subtitle={undefined} defaultExpanded />
    </Column>
  ),
};
