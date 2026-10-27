import { useEffect } from 'react';
import type { EffectCallback } from 'react';

/** Runs `effect` once on mount (and its cleanup on unmount). */
export function useMountEffect(effect: EffectCallback): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- mount-only by design
  useEffect(() => effect(), []);
}
