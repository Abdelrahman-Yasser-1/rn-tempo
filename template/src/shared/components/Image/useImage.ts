import { useState } from 'react';

import type { ImageProps } from './types';

/** A stable identity for the source, so a new source starts loading again. */
function sourceKey(source: ImageProps['source']): string {
  return typeof source === 'number' ? String(source) : (source.uri ?? '');
}

/**
 * Load state of an image: loading until the native view reports `onLoad`, failed after `onError`.
 * The state is tied to the source, so changing the source resets it without an effect.
 */
export function useImage(source: ImageProps['source']) {
  const key = sourceKey(source);
  const [loadedKey, setLoadedKey] = useState<string>();
  const [failedKey, setFailedKey] = useState<string>();
  const hasFailed = failedKey === key;

  const onLoad = () => {
    setLoadedKey(key);
  };

  const onError = () => {
    setFailedKey(key);
  };

  return { isLoading: !hasFailed && loadedKey !== key, hasFailed, onLoad, onError };
}
