import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { HomeStackParamList } from '@navigation/types';
import {
  // @tempo-feature:webview:start
  Button,
  // @tempo-feature:webview:end
  DetailsShimmer,
  ErrorState,
  Header,
  Image,
  Screen,
  Text,
} from '@shared/components';
import { formatCurrency, formatNumber } from '@shared/utils';

import { styles } from './styles';
import { useItemDetailsScreen } from './useItemDetailsScreen';

type ItemDetailsScreenProps = Readonly<{ route: RouteProp<HomeStackParamList, 'ItemDetails'> }>;

const IMAGE_HEIGHT = 240;

export function ItemDetailsScreen({ route }: ItemDetailsScreenProps) {
  const { t } = useTranslation('items');
  const vm = useItemDetailsScreen(route);
  const { data } = vm;

  let body;
  if (vm.isError) {
    body = <ErrorState error={vm.error} onRetry={vm.onRetry} testID="item-details.error" />;
  } else if (!data) {
    body = <DetailsShimmer testID="item-details.loading" />;
  } else {
    body = (
      <View style={styles.body}>
        <Image
          source={{ uri: data.thumbnail }}
          accessibilityLabel={data.title}
          height={IMAGE_HEIGHT}
          radius="lg"
          testID="item-details.image"
        />
        <Text variant="h2" accessibilityRole="header" testID="item-details.title">
          {data.title}
        </Text>
        <Text variant="title" color="primary" testID="item-details.price">
          {formatCurrency(data.price, 'USD', vm.language)}
        </Text>
        <View style={styles.facts}>
          <Text color="textSecondary" testID="item-details.category">
            {t('details.category', { category: data.category })}
          </Text>
          <Text color="textSecondary" testID="item-details.rating">
            {t('details.rating', { rating: formatNumber(data.rating, vm.language) })}
          </Text>
          <Text color="textSecondary" testID="item-details.stock">
            {t('details.stock', { stock: formatNumber(data.stock, vm.language) })}
          </Text>
        </View>
        <Text testID="item-details.description">{data.description}</Text>
        {/* @tempo-feature:webview:start */}
        <Button
          title={t('details.openProduct')}
          variant="outline"
          icon="external-link"
          fullWidth
          onPress={vm.onOpenProductPage}
          testID="item-details.open-product-button"
        />
        {/* @tempo-feature:webview:end */}
      </View>
    );
  }

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="item-details-screen">
      <Header title={t('details.title')} onBack={vm.onBack} testID="item-details.header" />
      {body}
    </Screen>
  );
}
