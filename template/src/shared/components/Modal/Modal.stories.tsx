import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Button } from '../Button';
import { Text } from '../Text';

import { Modal } from './Modal';
import type { ModalProps } from './types';

function Stateful(args: ModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <Button
        title="Open modal"
        onPress={() => {
          setIsVisible(true);
        }}
      />
      <Modal
        {...args}
        visible={isVisible}
        onClose={() => {
          setIsVisible(false);
        }}
      >
        <Text color="textSecondary">Any content goes here.</Text>
        <Button
          title="Done"
          variant="outline"
          onPress={() => {
            setIsVisible(false);
          }}
        />
      </Modal>
    </>
  );
}

const meta = {
  title: 'Overlays/Modal',
  component: Modal,
  args: { visible: false, title: 'Modal title', dismissable: true, onClose: action('onClose') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Blocking: Story = { args: { dismissable: false } };
