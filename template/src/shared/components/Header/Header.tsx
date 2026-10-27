import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useRTL } from '@shared/hooks';

import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { HeaderProps } from './types';

/** Screen header: optional back button (RTL-aware chevron), a title and trailing actions. */
export function Header({ title, onBack, backLabel, right, testID }: HeaderProps) {
  const { t } = useTranslation();
  const isRTL = useRTL();

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.slot}>
        {onBack !== undefined && (
          <IconButton
            testID={testID ? `${testID}.back` : undefined}
            icon={isRTL ? 'chevron-right' : 'chevron-left'}
            accessibilityLabel={backLabel ?? t('header.back')}
            onPress={onBack}
          />
        )}
      </View>
      <Text
        testID={testID ? `${testID}.title` : undefined}
        style={styles.title}
        variant="title"
        align="center"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={[styles.slot, styles.end]}>{right}</View>
    </View>
  );
}
