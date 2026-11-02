import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { HomeStackParamList } from '@navigation/types';
import { useLanguage } from '@services/i18n/useLanguage';
import { DetailsShimmer, ErrorState, Header, Image, Screen, Text } from '@shared/components';
import { formatCurrency, formatNumber } from '@shared/utils';

import { useItemQuery } from '../../api/queries';

import { styles } from './styles';

type ItemDetailsScreenProps = Readonly<NativeStackScreenProps<HomeStackParamList, 'ItemDetails'>>;

const IMAGE_HEIGHT = 240;

export function ItemDetailsScreen({ navigation, route }: ItemDetailsScreenProps) {
  const { t } = useTranslation('items');
  const { language } = useLanguage();
  const { data, error, isPending, isError, refetch } = useItemQuery(route.params.itemId);

  let body;
  if (isPending) {
    body = <DetailsShimmer testID="item-details.loading" />;
  } else if (isError) {
    body = (
      <ErrorState
        error={error}
        onRetry={() => {
          void refetch();
        }}
        testID="item-details.error"
      />
    );
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
          {formatCurrency(data.price, 'USD', language)}
        </Text>
        <View style={styles.facts}>
          <Text color="textSecondary" testID="item-details.category">
            {t('details.category', { category: data.category })}
          </Text>
          <Text color="textSecondary" testID="item-details.rating">
            {t('details.rating', { rating: formatNumber(data.rating, language) })}
          </Text>
          <Text color="textSecondary" testID="item-details.stock">
            {t('details.stock', { stock: formatNumber(data.stock, language) })}
          </Text>
        </View>
        <Text testID="item-details.description">{data.description}</Text>
      </View>
    );
  }

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="item-details-screen">
      <Header title={t('details.title')} onBack={navigation.goBack} testID="item-details.header" />
      {body}
    </Screen>
  );
}
