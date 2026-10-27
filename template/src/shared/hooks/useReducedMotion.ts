import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether the user asked the OS to reduce motion; updates live. */
export function useReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(false);

  useEffect(() => {
    let isActive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isActive) {
        setIsReduced(isEnabled);
      }
      return isEnabled;
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setIsReduced);
    return () => {
      isActive = false;
      subscription.remove();
    };
  }, []);

  return isReduced;
}
