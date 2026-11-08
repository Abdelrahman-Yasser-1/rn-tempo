/* eslint-disable @typescript-eslint/unbound-method -- asserting on the restart mock function */
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import RNRestart from 'react-native-restart';

import { ApiError } from '@services/http/errors';
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
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- error state wrapper has no role
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

  it('logs an operational error as a warning, not an error', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
    const error = jest.spyOn(logger, 'error').mockImplementation(jest.fn());
    function Offline(): never {
      throw new ApiError({ code: 'NETWORK', message: 'offline' });
    }
    await renderWithProviders(
      <ErrorBoundary>
        <Offline />
      </ErrorBoundary>,
    );
    expect(warn).toHaveBeenCalledWith(
      'Unhandled render error',
      expect.objectContaining({ name: 'ApiError' }),
      expect.any(String),
    );
    expect(error).not.toHaveBeenCalled();
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

  it('shows "Try again" for a screen and re-renders the children from it', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) {
        throw new Error('flaky');
      }
      return <Text>Back to normal</Text>;
    }
    const onReset = jest.fn();
    const { user } = await renderWithProviders(
      <ErrorBoundary variant="screen" onReset={onReset}>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('button', { name: 'Restart app' })).not.toBeOnTheScreen();

    shouldThrow = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Back to normal')).toBeOnTheScreen();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('offers "Go back" only for a screen that has somewhere to go', async () => {
    const onGoBack = jest.fn();
    const { user } = await renderWithProviders(
      <ErrorBoundary variant="screen" onGoBack={onGoBack}>
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );
    await user.press(screen.getByRole('button', { name: 'Go back' }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('has no "Go back" without a handler', async () => {
    await renderWithProviders(
      <ErrorBoundary variant="screen">
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeOnTheScreen();
  });

  it('resets when a reset key changes, and not when it stays the same', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) {
        throw new Error('flaky');
      }
      return <Text>Reset by key</Text>;
    }
    const tree = (key: string) => (
      <ErrorBoundary variant="screen" resetKeys={[key]}>
        <Flaky />
      </ErrorBoundary>
    );
    const { rerender } = await renderWithProviders(tree('a'));
    shouldThrow = false;

    await rerender(tree('a'));
    expect(screen.queryByText('Reset by key')).not.toBeOnTheScreen();

    await rerender(tree('b'));
    expect(screen.getByText('Reset by key')).toBeOnTheScreen();
  });

  it('names the screen in the log line', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(jest.fn());
    await renderWithProviders(
      <ErrorBoundary variant="screen" screenName="ItemDetails">
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );
    expect(logError).toHaveBeenCalledWith(
      'Unhandled render error in ItemDetails',
      expect.any(Error),
      expect.any(String),
    );
  });
});
