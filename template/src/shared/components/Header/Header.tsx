import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { HeaderProps } from './types';

const MAX_ACTIONS = 3;

/**
 * Screen header: optional back button (its chevron mirrors in RTL), a title with an optional
 * subtitle and up to three trailing icon actions.
 */
export function Header({
  title,
  subtitle,
  onBack,
  backLabel,
  actions = [],
  variant = 'default',
  testID,
}: HeaderProps) {
  const { t } = useTranslation();
  // `default` is Unistyles' fallback variant, selected by passing nothing.
  styles.useVariants({ variant: variant === 'default' ? undefined : variant });
  const isOnColor = variant === 'onColor';
  const buttonVariant = isOnColor ? 'outlineOnColor' : 'ghost';

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.slot}>
        {onBack !== undefined && (
          <IconButton
            testID={testID ? `${testID}.back` : undefined}
            icon="chevron-left"
            variant={buttonVariant}
            accessibilityLabel={backLabel ?? t('header.back')}
            onPress={onBack}
          />
        )}
      </View>
      <View style={styles.titles}>
        <Text
          testID={testID ? `${testID}.title` : undefined}
          style={styles.title}
          variant="title"
          color={isOnColor ? 'onPrimary' : 'textPrimary'}
          align="center"
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle !== undefined && subtitle !== '' && (
          <Text
            testID={testID ? `${testID}.subtitle` : undefined}
            style={styles.title}
            variant="caption"
            color={isOnColor ? 'onPrimary' : 'textSecondary'}
            align="center"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <View style={[styles.slot, styles.end]}>
        {actions.slice(0, MAX_ACTIONS).map((action) => (
          <IconButton
            key={action.accessibilityLabel}
            testID={action.testID}
            icon={action.icon}
            variant={buttonVariant}
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
          />
        ))}
      </View>
    </View>
  );
}
