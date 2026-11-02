import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

import { useIsOnline } from '@shared/hooks';

import type { ConnectionModalProps } from './types';

const DEFAULT_DELAY_MS = 5000;

/** Logic of the connection modal: visible once offline for `delayMs`, and the retry action. */
export function useConnectionModal({
  enabled: isEnabled = true,
  delayMs = DEFAULT_DELAY_MS,
  onRetry,
}: Pick<ConnectionModalProps, 'enabled' | 'delayMs' | 'onRetry'>) {
  const isOnline = useIsOnline();
  const [hasWaited, setHasWaited] = useState(false);
  const isGuarding = isEnabled && !isOnline;

  useEffect(() => {
    const timer = isGuarding
      ? setTimeout(() => {
          setHasWaited(true);
        }, delayMs)
      : undefined;
    return () => {
      clearTimeout(timer);
      setHasWaited(false);
    };
  }, [isGuarding, delayMs]);

  const onRetryPress = () => {
    void NetInfo.refresh();
    onRetry?.();
  };

  return { isVisible: isGuarding && hasWaited, onRetryPress };
}
