import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Column } from '@shared/components/Column';

import { ListItemContent } from './ListItemContent';
import type { ListItemContentProps, ListItemLayout } from './types';

const LAYOUTS: ListItemLayout[] = ['default', 'stacked', 'inline'];

const meta = {
  title: 'Display/ListItemContent',
  component: ListItemContent,
  args: {
    title: 'Riyadh Season',
    subtitle: 'Boulevard World',
    meta: '12 Nov, 8:00 PM',
    layout: 'default',
  },
  argTypes: { layout: { control: 'select', options: LAYOUTS } },
} satisfies Meta<typeof ListItemContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Layouts: Story = {
  render: (args) => (
    <Column gap="lg">
      {LAYOUTS.map((layout) => (
        <ListItemContent
          key={layout}
          {...args}
          layout={layout}
          leading={{ type: 'icon', name: 'bell' }}
          trailing={{ type: 'chevron' }}
        />
      ))}
    </Column>
  ),
};

export const LeadingSlots: Story = {
  render: (args) => (
    <Column gap="md">
      <ListItemContent {...args} leading={{ type: 'icon', name: 'user' }} />
      <ListItemContent {...args} leading={{ type: 'avatar', name: 'Ada Lovelace' }} />
      <ListItemContent
        {...args}
        leading={{ type: 'image', source: { uri: 'https://picsum.photos/id/1011/96/96' } }}
      />
    </Column>
  ),
};

function SwitchRow(args: ListItemContentProps) {
  const [isOn, setIsOn] = useState(true);
  return (
    <ListItemContent {...args} trailing={{ type: 'switch', value: isOn, onValueChange: setIsOn }} />
  );
}

export const TrailingSlots: Story = {
  render: (args) => (
    <Column gap="md">
      <ListItemContent {...args} trailing={{ type: 'chevron' }} />
      <SwitchRow {...args} />
      <ListItemContent {...args} trailing={{ type: 'text', text: '4.5' }} />
      <ListItemContent {...args} trailing={{ type: 'badge', count: 3, variant: 'error' }} />
    </Column>
  ),
};
