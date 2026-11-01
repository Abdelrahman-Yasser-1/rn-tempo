import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders title, message and the default confirm and cancel buttons', async () => {
    await renderWithProviders(
      <Dialog
        visible
        title="Sign out?"
        message="You will need to log in again."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Sign out?' })).toBeOnTheScreen();
    expect(screen.getByText('You will need to log in again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeOnTheScreen();
  });

  it('uses custom labels when given', async () => {
    await renderWithProviders(
      <Dialog
        visible
        title="Delete"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeOnTheScreen();
  });

  it('calls onConfirm and onCancel from their buttons', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { user } = await renderWithProviders(
      <Dialog visible title="Delete" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks the cancel button and busies the confirm button while loading', async () => {
    const onCancel = jest.fn();
    const { user } = await renderWithProviders(
      <Dialog visible loading title="Working" onConfirm={jest.fn()} onCancel={onCancel} />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeBusy();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders nothing when not visible', async () => {
    await renderWithProviders(
      <Dialog visible={false} title="Gone" onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.queryByRole('header', { name: 'Gone' })).not.toBeOnTheScreen();
  });
});
