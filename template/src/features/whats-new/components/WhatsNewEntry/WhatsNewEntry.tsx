import { useTranslation } from 'react-i18next';

import { Card, Text } from '@shared/components';

import { useWhatsNewEntry } from './useWhatsNewEntry';

/** Card for the Home screen that opens What's new. */
export function WhatsNewEntry() {
  const { t } = useTranslation('whats-new');
  const vm = useWhatsNewEntry();

  return (
    <Card
      variant="outlined"
      accessibilityRole="button"
      accessibilityLabel={t('entry.title')}
      onPress={vm.onPress}
      testID="home.whats-new"
    >
      <Text variant="title">{t('entry.title')}</Text>
      <Text color="textSecondary">{t('entry.hint')}</Text>
    </Card>
  );
}
