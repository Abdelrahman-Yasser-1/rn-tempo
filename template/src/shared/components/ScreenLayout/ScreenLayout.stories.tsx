import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Button } from '@shared/components/Button';
import { Text } from '@shared/components/Text';

import { ScreenLayout } from './ScreenLayout';

const meta = {
  title: 'Layout/ScreenLayout',
  component: ScreenLayout,
  args: {
    header: { title: 'Settings', onBack: action('onBack') },
    scroll: true,
    animated: true,
    footer: <Button title="Save" fullWidth onPress={action('onSave')} />,
    children: <Text>Screen content goes here.</Text>,
  },
} satisfies Meta<typeof ScreenLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const FixedWithoutFooter: Story = { args: { scroll: false, footer: undefined } };
