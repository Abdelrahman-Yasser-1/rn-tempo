import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { Button, EmptyState, FormTextField, Header, Screen } from '@shared/components';

import { useCreateItemMutation } from '../../api/mutations';
import { CreateItemSchema, type CreateItem, type CreateItemInput } from '../../types';

import { styles } from './styles';

export function ItemCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemCreate'>>();
  const { t } = useTranslation('items');
  const isEnabled = useFeatureFlag('itemsCreateEnabled');
  const createItem = useCreateItemMutation();
  const { control, handleSubmit } = useForm<CreateItemInput, unknown, CreateItem>({
    resolver: zodResolver(CreateItemSchema),
    defaultValues: { title: '', price: '', description: '', category: '' },
  });

  const submit = handleSubmit((values) => {
    createItem.mutate(values, { onSuccess: navigation.goBack });
  });

  const onSubmit = () => {
    void submit();
  };

  return (
    <Screen
      preset="scroll"
      keyboardAware
      contentContainerStyle={styles.content}
      testID="item-create-screen"
    >
      <Header title={t('create.title')} onBack={navigation.goBack} testID="item-create.header" />
      {isEnabled ? (
        <>
          <FormTextField
            control={control}
            name="title"
            label={t('create.titleLabel')}
            returnKeyType="next"
            testID="item-create.title-input"
          />
          <FormTextField
            control={control}
            name="price"
            label={t('create.price')}
            keyboardType="decimal-pad"
            returnKeyType="next"
            testID="item-create.price-input"
          />
          <FormTextField
            control={control}
            name="description"
            label={t('create.description')}
            multiline
            testID="item-create.description-input"
          />
          <FormTextField
            control={control}
            name="category"
            label={t('create.category')}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            testID="item-create.category-input"
          />
          <Button
            title={t('create.submit')}
            fullWidth
            loading={createItem.isPending}
            onPress={onSubmit}
            testID="item-create.submit-button"
          />
        </>
      ) : (
        <EmptyState
          icon="alert-circle"
          title={t('create.unavailable')}
          testID="item-create.unavailable"
        />
      )}
    </Screen>
  );
}
