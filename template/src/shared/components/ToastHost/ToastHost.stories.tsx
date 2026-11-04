import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

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
          variant="outline"
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
        <Button
          title="With actions"
          variant="outline"
          onPress={() => {
            toast.show({
              type: 'info',
              title: 'Item archived',
              description: 'You can undo this for a few seconds.',
              actions: [
                { label: 'Undo', onPress: action('undo') },
                { label: 'View', onPress: action('view') },
              ],
            });
          }}
        />
        <Button
          title="Closable"
          variant="outline"
          onPress={() => {
            toast.show({ type: 'success', title: 'Profile updated', isClosable: true });
          }}
        />
        <Button
          title="Fixed (no auto-hide)"
          variant="outline"
          onPress={() => {
            toast.show({
              type: 'warning',
              title: 'Update required',
              description: 'Stays until you close it.',
              isFixed: true,
              isClosable: true,
            });
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
