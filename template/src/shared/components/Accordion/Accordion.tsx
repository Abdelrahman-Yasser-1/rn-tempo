import { Fragment } from 'react';
import { View } from 'react-native';

import { AccordionItem } from '../AccordionItem';
import { Divider } from '../Divider';

import { styles } from './styles';
import type { AccordionProps } from './types';
import { useAccordion } from './useAccordion';

/** Group of `AccordionItem`s that keeps one open at a time, or several with `allowMultiple`. */
export function Accordion({
  items,
  allowMultiple: isMultiple,
  defaultExpandedKeys,
  expandedKeys,
  onChange,
  testID,
}: AccordionProps) {
  const { openKeys, onToggle } = useAccordion({
    allowMultiple: isMultiple,
    defaultExpandedKeys,
    expandedKeys,
    onChange,
  });

  return (
    <View testID={testID} style={styles.root}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <Divider />}
          <AccordionItem
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            disabled={item.disabled}
            expanded={openKeys.includes(item.key)}
            testID={testID ? `${testID}.${item.key}` : undefined}
            onToggle={(isExpanded) => {
              onToggle(item.key, isExpanded);
            }}
          >
            {item.content}
          </AccordionItem>
        </Fragment>
      ))}
    </View>
  );
}
