import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Button } from '../Button';

import { Dialog } from './Dialog';
import type { DialogProps } from './types';

function Stateful(args: DialogProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <Button
        title="Open dialog"
        onPress={() => {
          setIsVisible(true);
        }}
      />
      <Dialog
        {...args}
        visible={isVisible}
        onCancel={() => {
          setIsVisible(false);
        }}
        onConfirm={() => {
          setIsVisible(false);
        }}
      />
    </>
  );
}

const meta = {
  title: 'Overlays/Dialog',
  component: Dialog,
  args: {
    visible: false,
    title: 'Restart required',
    message: 'Switching language changes the layout direction. The app will restart.',
    destructive: false,
    loading: false,
    onConfirm: action('onConfirm'),
    onCancel: action('onCancel'),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Destructive: Story = {
  args: { title: 'Delete item?', message: 'This cannot be undone.', destructive: true },
};

export const CustomLabels: Story = { args: { confirmLabel: 'Restart now', cancelLabel: 'Later' } };
