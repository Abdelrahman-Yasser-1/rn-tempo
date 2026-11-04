import { useState } from 'react';

/** Open state of the inline tooltip hint. */
export function useFieldLabel() {
  const [isHintOpen, setIsHintOpen] = useState(false);

  const onToggleHint = () => {
    setIsHintOpen((isOpen) => !isOpen);
  };

  return { isHintOpen, onToggleHint };
}
