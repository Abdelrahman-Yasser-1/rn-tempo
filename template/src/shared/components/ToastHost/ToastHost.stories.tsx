import type { Meta, StoryObj } from '@storybook/react-native';

import { toast } from '@services/toast/toast';

import { Button } from '../Button';
import { Column } from '../Column';

import { ToastHost } from './ToastHost';

const meta = {
  title: 'Feedback/Toast',
  component: ToastHost,
  render: (args) => (
    <>
      <Column gap="md">
        <Button
          title="Success"
          onPress={() => {
            toast.success('Saved', 'Your changes were stored.');
          }}
        />
        <Button
          title="Error"
          variant="danger"
          onPress={() => {
            toast.error('Could not save', 'Check your connection and try again.');
          }}
        />
        <Button
          title="Info"
          variant="secondary"
          onPress={() => {
            toast.info('Heads up');
          }}
        />
        <Button
          title="Warning"
          variant="outline"
          onPress={() => {
            toast.warning('Storage almost full', 'Free some space soon.');
          }}
        />
      </Column>
      <ToastHost {...args} />
    </>
  ),
} satisfies Meta<typeof ToastHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { position: 'top' } };
