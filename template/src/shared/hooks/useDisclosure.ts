import { useCallback, useState } from 'react';

/** Open/closed state for modals, sheets and menus. */
export function useDisclosure(isInitiallyOpen = false) {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);
  const toggle = useCallback(() => {
    setIsOpen((wasOpen) => !wasOpen);
  }, []);

  return { isOpen, open, close, toggle };
}
