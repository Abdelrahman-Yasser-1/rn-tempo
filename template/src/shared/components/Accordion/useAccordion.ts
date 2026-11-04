import { useState } from 'react';

import type { AccordionProps } from './types';

type UseAccordionParams = Pick<
  AccordionProps,
  'allowMultiple' | 'defaultExpandedKeys' | 'expandedKeys' | 'onChange'
>;

/** Open keys of an accordion group, controlled or not; single-open unless `allowMultiple`. */
export function useAccordion({
  allowMultiple: isMultiple = false,
  defaultExpandedKeys = [],
  expandedKeys,
  onChange,
}: UseAccordionParams) {
  const [internalKeys, setInternalKeys] = useState<readonly string[]>(defaultExpandedKeys);
  const openKeys = expandedKeys ?? internalKeys;

  const onToggle = (key: string, isExpanded: boolean) => {
    let next: readonly string[];
    if (isExpanded) {
      next = isMultiple ? [...openKeys, key] : [key];
    } else {
      next = openKeys.filter((openKey) => openKey !== key);
    }
    if (expandedKeys === undefined) {
      setInternalKeys(next);
    }
    onChange?.(next);
  };

  return { openKeys, onToggle };
}
