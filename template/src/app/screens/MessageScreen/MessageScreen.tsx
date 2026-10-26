/* eslint-disable no-restricted-imports -- WS4 (task 4.x): replace Text/View/Pressable with shared Text, Screen and Button */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { styles } from './styles';

type Props = {
  /** Screen root id, e.g. `force-update-screen`; action ids are set by each `MessageButton`. */
  testID: string;
  title: string;
  message: string;
  children?: ReactNode;
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  testID: string;
};

/** Primary action button for `MessageScreen`. */
export function MessageButton({ label, onPress, testID }: Readonly<ButtonProps>) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button} testID={testID}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

/** Full-screen title + message + optional `MessageButton` children, shared by blocking app screens. */
export function MessageScreen({ testID, title, message, children }: Readonly<Props>) {
  return (
    <View style={styles.container} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}
