import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AnnouncementCard } from '@features/whats-new/components/AnnouncementCard';
import type { CmsEntry, CmsPage } from '@services/cms';
import { EmptyState, Header, PaginatedList, Screen } from '@shared/components';

import { styles } from './styles';
import { useWhatsNewScreen } from './useWhatsNewScreen';

const getAnnouncements = (page: CmsPage) => page.items;
const getAnnouncementKey = (entry: CmsEntry) => String(entry.id);

export function WhatsNewScreen() {
  const { t } = useTranslation('whats-new');
  const vm = useWhatsNewScreen();

  const renderItem = ({ item, index }: Readonly<{ item: CmsEntry; index: number }>) => (
    <AnnouncementCard
      entry={item}
      onCtaPress={vm.onOpenLink}
      testID={`whats-new.item-${String(index)}`}
    />
  );

  return (
    <Screen preset="fixed" testID="whats-new-screen">
      <Header title={t('title')} onBack={vm.onBack} testID="whats-new.header" />
      <View style={styles.body}>
        <PaginatedList
          query={vm.announcementsQuery}
          getItems={getAnnouncements}
          renderItem={renderItem}
          keyExtractor={getAnnouncementKey}
          ListEmptyComponent={
            <EmptyState
              icon="bell"
              title={t('empty.title')}
              message={t('empty.message')}
              testID="whats-new.empty"
            />
          }
          testID="whats-new"
        />
      </View>
    </Screen>
  );
}
