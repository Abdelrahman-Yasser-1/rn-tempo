import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button, Screen, Text } from '@shared/components';

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
  return <Button fullWidth onPress={onPress} testID={testID} title={label} />;
}

/** Full-screen title + message + optional `MessageButton` children, shared by blocking app screens. */
export function MessageScreen({ testID, title, message, children }: Readonly<Props>) {
  return (
    <Screen contentContainerStyle={styles.container} testID={testID}>
      <Text align="center" variant="h2">
        {title}
      </Text>
      <Text align="center" color="textSecondary">
        {message}
      </Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Screen>
  );
}
