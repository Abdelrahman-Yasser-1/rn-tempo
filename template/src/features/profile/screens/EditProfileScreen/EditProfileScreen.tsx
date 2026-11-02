import { useTranslation } from 'react-i18next';

import { Button, FormTextField, Header, Screen } from '@shared/components';

import { styles } from './styles';
import { useEditProfileScreen } from './useEditProfileScreen';

export function EditProfileScreen() {
  const { t } = useTranslation('profile');
  const vm = useEditProfileScreen();

  return (
    <Screen
      preset="scroll"
      keyboardAware
      contentContainerStyle={styles.content}
      testID="edit-profile-screen"
    >
      <Header title={t('editTitle')} onBack={vm.onBack} testID="edit-profile.header" />
      <FormTextField
        control={vm.control}
        name="firstName"
        label={t('firstName')}
        autoComplete="given-name"
        returnKeyType="next"
        testID="edit-profile.first-name-input"
      />
      <FormTextField
        control={vm.control}
        name="lastName"
        label={t('lastName')}
        autoComplete="family-name"
        returnKeyType="next"
        testID="edit-profile.last-name-input"
      />
      <FormTextField
        control={vm.control}
        name="email"
        label={t('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={vm.onSubmit}
        testID="edit-profile.email-input"
      />
      <Button
        title={t('save')}
        fullWidth
        loading={vm.isPending}
        onPress={vm.onSubmit}
        testID="edit-profile.save-button"
      />
    </Screen>
  );
}
