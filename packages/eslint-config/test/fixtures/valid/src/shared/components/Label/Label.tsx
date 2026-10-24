import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { formatName } from '@shared/utils';

import type { LabelProps } from './types';

const styles = StyleSheet.create({ text: { fontSize: 14 } });

/** Plain text label. */
export function Label({ text, isActive }: Readonly<LabelProps>) {
  return <Text style={styles.text}>{isActive ? formatName(text) : text}</Text>;
}
