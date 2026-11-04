import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '../Text';

import { Loader } from './Loader';

const styles = StyleSheet.create({ frame: { height: 320 } });

const meta = {
  title: 'Feedback/Loader',
  component: Loader,
  args: { size: 'lg', variant: 'inline' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'lg'] },
    variant: { control: 'select', options: ['inline', 'overlay'] },
  },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const WithLabel: Story = { args: { label: 'Loading your items' } };

/** Covers the frame and blocks touches; the label is optional. */
export const Overlay: Story = {
  render: (args) => (
    <View style={styles.frame}>
      <Text>Content under the overlay</Text>
      <Loader {...args} variant="overlay" label="Submitting" />
    </View>
  ),
};
