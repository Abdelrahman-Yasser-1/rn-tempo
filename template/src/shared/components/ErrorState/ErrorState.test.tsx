import { screen } from '@testing-library/react-native';

import { ApiError } from '@services/http/errors';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('is an alert with the default title and a generic message', async () => {
    // The alert container has no accessibility flag, so its role is only observable by testID.
    await renderWithProviders(<ErrorState testID="error" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible alert container has no role query
    expect(screen.getByTestId('error')).toHaveProp('accessibilityRole', 'alert');
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeOnTheScreen();
  });

  it('explains network failures using the error code', async () => {
    const error = new ApiError({ code: 'NETWORK', message: 'socket hang up' });
    await renderWithProviders(<ErrorState error={error} />);
    expect(
      screen.getByText('No internet connection. Check your network and try again.'),
    ).toBeOnTheScreen();
  });

  it('explains timeouts using the error code', async () => {
    const error = new ApiError({ code: 'TIMEOUT', message: 'slow' });
    await renderWithProviders(<ErrorState error={error} />);
    expect(screen.getByText('The request took too long. Please try again.')).toBeOnTheScreen();
  });

  it('uses custom title and message when given', async () => {
    await renderWithProviders(<ErrorState title="Oops" message="Could not load the list" />);
    expect(screen.getByText('Oops')).toBeOnTheScreen();
    expect(screen.getByText('Could not load the list')).toBeOnTheScreen();
  });

  it('calls onRetry from the retry button with the default label', async () => {
    const onRetry = jest.fn();
    const { user } = await renderWithProviders(<ErrorState onRetry={onRetry} />);
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses a custom retry label', async () => {
    await renderWithProviders(<ErrorState onRetry={jest.fn()} retryLabel="Try again" />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('shows no retry button without onRetry', async () => {
    await renderWithProviders(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
