/* eslint-disable @typescript-eslint/unbound-method -- asserting on the restart mock function */
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import RNRestart from 'react-native-restart';

import { logger } from '@services/logger/logger';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ErrorBoundary } from './ErrorBoundary';

function Boom({ message }: Readonly<{ message: string }>): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React reports caught render errors on console.error; the boundary handles them itself.
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders its children when nothing throws', async () => {
    await renderWithProviders(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeOnTheScreen();
  });

  it('shows the error state with a restart action after a render error', async () => {
    await renderWithProviders(
      <ErrorBoundary testID="boundary">
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Restart app' })).toBeOnTheScreen();
    // eslint-disable-next-line no-restricted-syntax -- error state wrapper has no role
    expect(screen.getByTestId('boundary.state', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('logs the error and forwards it to onError', async () => {
    const onError = jest.fn();
    const logError = jest.spyOn(logger, 'error').mockImplementation(jest.fn());
    await renderWithProviders(
      <ErrorBoundary onError={onError}>
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );
    expect(logError).toHaveBeenCalledWith(
      'Unhandled render error',
      expect.any(Error),
      expect.any(String),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'kaboom' }),
      expect.any(String),
    );
  });

  it('restarts the app from the restart action', async () => {
    const { user } = await renderWithProviders(
      <ErrorBoundary>
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );
    await user.press(screen.getByRole('button', { name: 'Restart app' }));
    expect(RNRestart.restart).toHaveBeenCalled();
  });
});
