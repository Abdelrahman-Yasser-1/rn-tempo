import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Image,
  ListItem,
  ListShimmer,
  Loader,
  Screen,
  TextField,
} from '@shared/components';
import { formatCurrency } from '@shared/utils';

import type { Item } from '../../types';

import { styles } from './styles';
import { useItemsListScreen } from './useItemsListScreen';

const THUMBNAIL_SIZE = 48;

export function ItemsListScreen() {
  const { t } = useTranslation('items');
  const vm = useItemsListScreen();

  const renderItem = ({ item, index }: Readonly<{ item: Item; index: number }>) => (
    <ListItem
      title={item.title}
      subtitle={formatCurrency(item.price, 'USD', vm.language)}
      left={
        <Image
          source={{ uri: item.thumbnail }}
          width={THUMBNAIL_SIZE}
          height={THUMBNAIL_SIZE}
          radius="md"
        />
      }
      showChevron
      showDivider
      accessibilityLabel={item.title}
      onPress={() => {
        vm.onItemPress(item.id);
      }}
      testID={`items-list.item-${String(index)}`}
    />
  );

  let body;
  if (vm.isPending) {
    body = <ListShimmer testID="items-list.loading" />;
  } else if (vm.isError) {
    body = <ErrorState error={vm.error} onRetry={vm.onRefresh} testID="items-list.error" />;
  } else {
    body = (
      <FlashList
        data={vm.items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        onEndReached={vm.onLoadMore}
        onEndReachedThreshold={0.5}
        refreshing={vm.isRefreshing}
        onRefresh={vm.onRefresh}
        ListEmptyComponent={
          <EmptyState
            title={t('list.emptyTitle')}
            message={t('list.emptyMessage')}
            testID="items-list.empty"
          />
        }
        ListFooterComponent={
          vm.isFetchingNextPage ? (
            <View style={styles.footer}>
              <Loader testID="items-list.loading-more" />
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <Screen preset="fixed" testID="items-list-screen">
      <Header
        title={t('list.title')}
        onBack={vm.onBack}
        right={
          vm.canCreate ? (
            <IconButton
              icon="plus"
              variant="ghost"
              accessibilityLabel={t('list.create')}
              onPress={vm.onCreate}
              testID="items-list.create-button"
            />
          ) : undefined
        }
        testID="items-list.header"
      />
      <View style={styles.search}>
        <TextField
          value={vm.search}
          onChangeText={vm.onSearchChange}
          placeholder={t('list.searchPlaceholder')}
          accessibilityLabel={t('list.searchLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          testID="items-list.search-input"
        />
      </View>
      <View style={styles.body}>{body}</View>
    </Screen>
  );
}
