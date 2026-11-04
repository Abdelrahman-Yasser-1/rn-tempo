import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';

import { useCreateItemMutation } from '../../api/mutations';
import { CreateItemSchema, type CreateItem, type CreateItemInput } from '../../types';

/** Logic of the create-item screen: feature flag, form, tag options and submit-then-go-back. */
export function useItemCreateScreen() {
  const { t } = useTranslation('items');
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemCreate'>>();
  const isEnabled = useFeatureFlag('itemsCreateEnabled');
  const createItem = useCreateItemMutation();
  const { control, handleSubmit } = useForm<CreateItemInput, unknown, CreateItem>({
    resolver: zodResolver(CreateItemSchema),
    defaultValues: { title: '', price: '', description: '', category: '', quantity: 1, tags: [] },
  });

  const submit = handleSubmit((values) => {
    createItem.mutate(values, { onSuccess: navigation.goBack });
  });

  const onSubmit = () => {
    void submit();
  };

  const tagOptions = [
    { value: 'new', label: t('create.tagOptions.new') },
    { value: 'sale', label: t('create.tagOptions.sale') },
    { value: 'popular', label: t('create.tagOptions.popular') },
    { value: 'eco', label: t('create.tagOptions.eco') },
  ];

  return {
    control,
    tagOptions,
    isEnabled,
    isPending: createItem.isPending,
    onSubmit,
    onBack: navigation.goBack,
  };
}
