import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { InlineMessage } from './InlineMessage';

describe('InlineMessage', () => {
  it('shows the title and description', async () => {
    await renderWithProviders(
      <InlineMessage title="Saved" description="Your changes are live" variant="success" />,
    );
    expect(screen.getByText('Saved')).toBeOnTheScreen();
    expect(screen.getByText('Your changes are live')).toBeOnTheScreen();
  });

  it.each(['error', 'warning'] as const)('announces a %s as an alert', async (variant) => {
    await renderWithProviders(<InlineMessage title="Heads up" variant={variant} testID="msg" />);
    // The banner holds a link and a button, so it is not an accessibility element itself and
    // its role is only observable by testID.
    // eslint-disable-next-line no-restricted-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('msg')).toHaveProp('accessibilityRole', 'alert');
  });

  it('does not use the alert role for info', async () => {
    await renderWithProviders(<InlineMessage title="FYI" testID="msg" />);
    // eslint-disable-next-line no-restricted-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('msg')).not.toHaveProp('accessibilityRole', 'alert');
  });

  it('runs the action link', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <InlineMessage title="Offline" action={{ label: 'Retry', onPress }} />,
    );
    await user.press(screen.getByRole('link', { name: 'Retry' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('dismisses with onClose', async () => {
    const onClose = jest.fn();
    const { user } = await renderWithProviders(<InlineMessage title="Tip" onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no dismiss button without onClose', async () => {
    await renderWithProviders(<InlineMessage title="Tip" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
