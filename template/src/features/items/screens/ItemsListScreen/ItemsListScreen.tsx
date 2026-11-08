import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Item, ItemsPage } from '@features/items/types';
import {
  EmptyState,
  Header,
  Image,
  ListItem,
  PaginatedList,
  Screen,
  TextField,
} from '@shared/components';
import type { HeaderAction } from '@shared/components';
import { formatCurrency } from '@shared/utils';

import { styles } from './styles';
import { useItemsListScreen } from './useItemsListScreen';

const THUMBNAIL_SIZE = 48;

const getItems = (page: ItemsPage) => page.products;
const getItemKey = (item: Item) => String(item.id);

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

  const createAction: HeaderAction = {
    icon: 'plus',
    accessibilityLabel: t('list.create'),
    onPress: vm.onCreate,
    testID: 'items-list.create-button',
  };

  return (
    <Screen preset="fixed" testID="items-list-screen">
      <Header
        title={t('list.title')}
        onBack={vm.onBack}
        actions={vm.canCreate ? [createAction] : undefined}
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
      <View style={styles.body}>
        <PaginatedList
          query={vm.itemsQuery}
          getItems={getItems}
          renderItem={renderItem}
          keyExtractor={getItemKey}
          ListEmptyComponent={
            <EmptyState
              title={t('list.emptyTitle')}
              message={t('list.emptyMessage')}
              testID="items-list.empty"
            />
          }
          testID="items-list"
        />
      </View>
    </Screen>
  );
}
