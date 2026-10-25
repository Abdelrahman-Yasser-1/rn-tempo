import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { ApiError } from './errors';
import { queryClient, shouldRetry } from './queryClient';

describe('queryClient', () => {
  test('AC-4: uses the planned cache defaults', () => {
    const defaults = queryClient.getDefaultOptions().queries;

    expect(defaults).toMatchObject({
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnReconnect: true,
    });
  });

  test('AC-4: retries transient errors at most twice and never client errors', () => {
    const transient = new ApiError({ code: 'SERVER', message: '' });
    const clientError = new ApiError({ code: 'NOT_FOUND', message: '' });

    expect(shouldRetry(0, transient)).toBe(true);
    expect(shouldRetry(1, transient)).toBe(true);
    expect(shouldRetry(2, transient)).toBe(false);
    expect(shouldRetry(0, clientError)).toBe(false);
  });

  test('AC-4: onlineManager follows NetInfo connectivity events', () => {
    const listener = jest.mocked(NetInfo.addEventListener).mock.calls[0]?.[0];

    listener?.({ isConnected: false } as NetInfoState);
    expect(onlineManager.isOnline()).toBe(false);

    listener?.({ isConnected: true } as NetInfoState);
    expect(onlineManager.isOnline()).toBe(true);
  });

  test('AC-4: focusManager follows AppState changes', () => {
    const addListener = jest.spyOn(AppState, 'addEventListener');
    const unsubscribe = focusManager.subscribe(jest.fn());
    const onChange = addListener.mock.calls[0]?.[1];

    onChange?.('background');
    expect(focusManager.isFocused()).toBe(false);

    onChange?.('active');
    expect(focusManager.isFocused()).toBe(true);

    unsubscribe();
    addListener.mockRestore();
  });
});
