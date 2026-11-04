import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { useUnistyles } from 'react-native-unistyles';

import type { IconName } from '@assets/generated/icons.types';
import type { ToastExtras, ToastType } from '@services/toast/toast';

import { Button } from '../Button';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { ToastHostProps } from './types';

const ICON: Record<ToastType, IconName> = {
  success: 'circle-check',
  error: 'circle-x',
  info: 'info',
  warning: 'alert-triangle',
};

const MAX_ACTIONS = 2;

type ToastCardProps = Readonly<
  { type: ToastType } & Pick<
    ToastConfigParams<ToastExtras | undefined>,
    'text1' | 'text2' | 'onPress' | 'props' | 'hide'
  >
>;

function ToastCard({ type, text1, text2, onPress, props, hide }: ToastCardProps) {
  const { t } = useTranslation();
  styles.useVariants({ type });
  const actions = (props?.actions ?? []).slice(0, MAX_ACTIONS);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={text2 ? `${text1 ?? ''}. ${text2}` : text1}
          testID={`toast.${type}`}
          style={styles.content}
          onPress={onPress}
        >
          <Icon name={ICON[type]} color={type} />
          <View style={styles.body}>
            {text1 !== undefined && (
              <Text testID={`toast.${type}.title`} variant="bodyStrong">
                {text1}
              </Text>
            )}
            {text2 !== undefined && (
              <Text testID={`toast.${type}.description`} variant="bodySmall" color="textSecondary">
                {text2}
              </Text>
            )}
          </View>
        </Pressable>
        {props?.isClosable === true && (
          <IconButton
            testID={`toast.${type}.close`}
            icon="close"
            size="sm"
            accessibilityLabel={t('toast.close')}
            onPress={() => {
              hide();
            }}
          />
        )}
      </View>
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Button
              key={action.label}
              testID={`toast.${type}.action.${action.label}`}
              title={action.label}
              variant="ghost"
              size="sm"
              onPress={() => {
                action.onPress();
                hide();
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function renderer(type: ToastType) {
  return ({ text1, text2, onPress, props, hide }: ToastConfigParams<ToastExtras | undefined>) => (
    <ToastCard
      type={type}
      text1={text1}
      text2={text2}
      onPress={onPress}
      props={props}
      hide={hide}
    />
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
