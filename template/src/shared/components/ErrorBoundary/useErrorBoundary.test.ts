import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useErrorBoundary } from './useErrorBoundary';

describe('useErrorBoundary', () => {
  it('uses "Try again" and the reset action for a screen', async () => {
    const onReset = jest.fn();
    const { result } = await renderHookWithProviders(() =>
      useErrorBoundary({ variant: 'screen', onReset }),
    );

    expect(result.current.retryLabel).toBe('Try again');
    expect(result.current.title).toBe('This screen ran into a problem');
    result.current.onRetry();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('uses "Restart app" for the app and keeps the default title', async () => {
    const onReset = jest.fn();
    const { result } = await renderHookWithProviders(() =>
      useErrorBoundary({ variant: 'app', onReset }),
    );

    expect(result.current.retryLabel).toBe('Restart app');
    expect(result.current.title).toBeUndefined();
  });
});
