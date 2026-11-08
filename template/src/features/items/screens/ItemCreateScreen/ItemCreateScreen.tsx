import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ATTACHMENT_MAX_MB } from '@features/items/constants';
import {
  Button,
  EmptyState,
  FormDatePicker,
  // @tempo-feature:file-picker:start
  FormFilePicker,
  // @tempo-feature:file-picker:end
  // @tempo-feature:maps:start
  FormMapPicker,
  // @tempo-feature:maps:end
  FormMultiSelect,
  FormNumberInput,
  FormTextField,
  FormTimeSlot,
  Header,
  Screen,
} from '@shared/components';

// @tempo-feature:file-picker:start

// @tempo-feature:file-picker:end
import { styles } from './styles';
import { useItemCreateScreen } from './useItemCreateScreen';

export function ItemCreateScreen() {
  const { t } = useTranslation('items');
  const vm = useItemCreateScreen();

  return (
    <Screen
      preset="scroll"
      keyboardAware
      contentContainerStyle={styles.content}
      testID="item-create-screen"
    >
      <Header title={t('create.title')} onBack={vm.onBack} testID="item-create.header" />
      <View style={styles.body}>
        {vm.isEnabled ? (
          <>
            <FormTextField
              control={vm.control}
              name="title"
              label={t('create.titleLabel')}
              returnKeyType="next"
              testID="item-create.title-input"
            />
            <FormTextField
              control={vm.control}
              name="price"
              label={t('create.price')}
              keyboardType="decimal-pad"
              returnKeyType="next"
              testID="item-create.price-input"
            />
            <FormTextField
              control={vm.control}
              name="description"
              label={t('create.description')}
              multiline
              testID="item-create.description-input"
            />
            <FormTextField
              control={vm.control}
              name="category"
              label={t('create.category')}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={vm.onSubmit}
              testID="item-create.category-input"
            />
            <FormNumberInput
              control={vm.control}
              name="quantity"
              label={t('create.quantity')}
              min={1}
              testID="item-create.quantity-input"
            />
            <FormMultiSelect
              control={vm.control}
              name="tags"
              label={t('create.tags')}
              subLabel={t('create.optional')}
              options={vm.tagOptions}
              testID="item-create.tags-select"
            />
            <FormDatePicker
              control={vm.control}
              name="availableFrom"
              label={t('create.availableFrom')}
              subLabel={t('create.optional')}
              minDate={vm.today}
              testID="item-create.available-from"
            />
            <FormTimeSlot
              control={vm.control}
              name="pickupSlot"
              label={t('create.pickupSlot')}
              subLabel={t('create.optional')}
              slots={vm.pickupSlots}
              testID="item-create.pickup-slot"
            />
            {/* @tempo-feature:file-picker:start */}
            <FormFilePicker
              control={vm.control}
              name="attachment"
              label={t('create.attachment')}
              subLabel={t('create.optional')}
              maxSizeMB={ATTACHMENT_MAX_MB}
              testID="item-create.attachment"
            />
            {/* @tempo-feature:file-picker:end */}
            {/* @tempo-feature:maps:start */}
            <FormMapPicker
              control={vm.control}
              name="pickupLocation"
              label={t('create.pickupLocation')}
              subLabel={t('create.optional')}
              testID="item-create.pickup-location"
            />
            {/* @tempo-feature:maps:end */}
            <Button
              title={t('create.submit')}
              fullWidth
              loading={vm.isPending}
              onPress={vm.onSubmit}
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
      </View>
    </Screen>
  );
}
