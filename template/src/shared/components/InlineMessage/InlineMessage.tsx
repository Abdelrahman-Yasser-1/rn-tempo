import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import type { IconName } from '@assets/generated/icons.types';
import { getStatusTint } from '@theme/statusTints';

import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Link } from '../Link';
import { Text } from '../Text';

import { styles } from './styles';
import type { InlineMessageProps, InlineMessageVariant } from './types';

const ICONS: Record<InlineMessageVariant, IconName> = {
  info: 'info',
  success: 'circle-check',
  warning: 'alert-triangle',
  error: 'alert-circle',
};

/** Tinted banner with a status icon, title, optional description, action link and dismiss. */
export function InlineMessage({
  variant = 'info',
  title,
  description,
  action,
  onClose,
  testID,
}: InlineMessageProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const tint = getStatusTint(theme, variant);
  styles.useVariants({ variant });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const isUrgent = variant === 'error' || variant === 'warning';

  return (
    <View
      accessibilityRole={isUrgent ? 'alert' : undefined}
      accessibilityLiveRegion={isUrgent ? undefined : 'polite'}
      testID={testID}
      style={styles.root}
    >
      <Icon name={ICONS[variant]} tint={tint.icon} />
      <View style={styles.body}>
        <Text testID={suffix('title')} variant="bodyStrong" style={styles.text(tint.text)}>
          {title}
        </Text>
        {description !== undefined && description !== '' && (
          <Text testID={suffix('description')} variant="bodySmall" style={styles.text(tint.text)}>
            {description}
          </Text>
        )}
        {action !== undefined && (
          <Link testID={suffix('action')} href={action.href} onPress={action.onPress}>
            {action.label}
          </Link>
        )}
      </View>
      {onClose !== undefined && (
        <IconButton
          testID={suffix('close')}
          icon="close"
          size="sm"
          accessibilityLabel={t('inlineMessage.close')}
          onPress={onClose}
        />
      )}
    </View>
  );
}
