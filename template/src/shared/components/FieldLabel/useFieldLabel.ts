import { useState } from 'react';

/** Visibility of the tooltip hint, driven by the tooltip. */
export function useFieldLabel() {
  const [isHintOpen, setIsHintOpen] = useState(false);

  const onHintVisibleChange = (isVisible: boolean) => {
    setIsHintOpen(isVisible);
  };

  return { isHintOpen, onHintVisibleChange };
}
