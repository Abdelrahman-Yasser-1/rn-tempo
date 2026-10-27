import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { useUnistyles } from 'react-native-unistyles';

import type { IconName } from '@assets/icons';
import type { ToastType } from '@services/toast/toast';
import type { ColorTokens } from '@theme/tokens';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { ToastHostProps } from './types';

const ICON: Record<ToastType, IconName> = {
  success: 'check',
  error: 'alert-circle',
  info: 'info',
  warning: 'alert-circle',
};

const CONTENT_COLOR: Record<ToastType, keyof ColorTokens> = {
  success: 'onSuccess',
  error: 'onError',
  info: 'onInfo',
  warning: 'onWarning',
};

function ToastCard({
  type,
  text1,
  text2,
  onPress,
}: Readonly<
  { type: ToastType } & Pick<ToastConfigParams<unknown>, 'text1' | 'text2' | 'onPress'>
>) {
  const color = CONTENT_COLOR[type];
  styles.useVariants({ type });

  return (
    <Pressable
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text2 ? `${text1 ?? ''}. ${text2}` : text1}
      testID={`toast.${type}`}
      style={styles.card}
      onPress={onPress}
    >
      <Icon name={ICON[type]} color={color} />
      <View style={styles.body}>
        {text1 !== undefined && (
          <Text testID={`toast.${type}.title`} variant="bodyStrong" color={color}>
            {text1}
          </Text>
        )}
        {text2 !== undefined && (
          <Text testID={`toast.${type}.message`} variant="bodySmall" color={color}>
            {text2}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function renderer(type: ToastType) {
  return ({ text1, text2, onPress }: ToastConfigParams<unknown>) => (
    <ToastCard type={type} text1={text1} text2={text2} onPress={onPress} />
  );
}

const config: ToastConfig = {
  success: renderer('success'),
  error: renderer('error'),
  info: renderer('info'),
  warning: renderer('warning'),
};

/** Mount once near the root (inside providers) to render `toast.show(...)` calls with theme tokens. */
export function ToastHost({ position = 'top' }: ToastHostProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  return (
    <Toast
      config={config}
      position={position}
      topOffset={insets.top + theme.spacing.sm}
      bottomOffset={insets.bottom + theme.spacing.sm}
    />
  );
}
