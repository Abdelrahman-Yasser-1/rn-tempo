import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCreateItemMutation } from '@features/items/api/mutations';
import { PICKUP_SLOTS } from '@features/items/constants';
import { CreateItemSchema, type CreateItem, type CreateItemInput } from '@features/items/types';
import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { toISODate } from '@shared/utils/calendar';

/** Logic of the create-item screen: feature flag, form, tag options and submit-then-go-back. */
export function useItemCreateScreen() {
  const { t } = useTranslation('items');
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemCreate'>>();
  const isEnabled = useFeatureFlag('itemsCreateEnabled');
  const createItem = useCreateItemMutation();
  const { control, handleSubmit } = useForm<CreateItemInput, unknown, CreateItem>({
    resolver: zodResolver(CreateItemSchema),
    defaultValues: {
      title: '',
      price: '',
      description: '',
      category: '',
      quantity: 1,
      tags: [],
      availableFrom: '',
      pickupSlot: '',
      // @tempo-feature:file-picker:start
      attachment: null,
      // @tempo-feature:file-picker:end
      // @tempo-feature:maps:start
      pickupLocation: null,
      // @tempo-feature:maps:end
    },
  });

  // Read once on mount so the render stays pure; the earliest availability day is today.
  const [today] = useState(() => toISODate(new Date()));

  // The optional fields only go in the request when they were set.
  const submit = handleSubmit(
    ({
      availableFrom,
      pickupSlot,
      // @tempo-feature:file-picker:start
      attachment,
      // @tempo-feature:file-picker:end
      // @tempo-feature:maps:start
      pickupLocation,
      // @tempo-feature:maps:end
      ...values
    }) => {
      createItem.mutate(
        {
          ...values,
          ...(availableFrom ? { availableFrom } : {}),
          ...(pickupSlot ? { pickupSlot } : {}),
          // @tempo-feature:file-picker:start
          ...(attachment ? { attachment } : {}),
          // @tempo-feature:file-picker:end
          // @tempo-feature:maps:start
          ...(pickupLocation ? { pickupLocation } : {}),
          // @tempo-feature:maps:end
        },
        { onSuccess: navigation.goBack },
      );
    },
  );

  const onSubmit = () => {
    void submit();
  };

  const tagOptions = [
    { value: 'new', label: t(($) => $.create.tagOptions.new) },
    { value: 'sale', label: t(($) => $.create.tagOptions.sale) },
    { value: 'popular', label: t(($) => $.create.tagOptions.popular) },
    { value: 'eco', label: t(($) => $.create.tagOptions.eco) },
  ];

  return {
    control,
    tagOptions,
    today,
    pickupSlots: PICKUP_SLOTS,
    isEnabled,
    isPending: createItem.isPending,
    onSubmit,
    onBack: navigation.goBack,
  };
}
