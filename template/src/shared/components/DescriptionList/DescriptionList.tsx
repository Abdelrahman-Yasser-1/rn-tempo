import { Fragment } from 'react';
import { View } from 'react-native';

import { Divider } from '../Divider';
import { KeyValueRow } from '../KeyValueRow';

import type { DescriptionListProps } from './types';

/** Stack of `KeyValueRow`s, optionally separated by dividers (detail screens, review pages). */
export function DescriptionList({
  items,
  layout = 'horizontal',
  dividers: hasDividers = true,
  testID,
}: DescriptionListProps) {
  return (
    <View testID={testID}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {hasDividers && index > 0 && <Divider />}
          <KeyValueRow
            label={item.label}
            value={item.value}
            layout={layout}
            testID={testID ? `${testID}.${item.key}` : undefined}
          />
        </Fragment>
      ))}
    </View>
  );
}
