import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';

import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';

import { useCreateItemMutation } from '../../api/mutations';
import { CreateItemSchema, type CreateItem, type CreateItemInput } from '../../types';

/** Logic of the create-item screen: feature flag, form and submit-then-go-back. */
export function useItemCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemCreate'>>();
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

  return {
    control,
    isEnabled,
    isPending: createItem.isPending,
    onSubmit,
    onBack: navigation.goBack,
  };
}
