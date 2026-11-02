import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, FormTextField, Header, Screen, Text } from '@shared/components';

import { FormError } from '../../components/FormError';

import { styles } from './styles';
import { useRegisterScreen } from './useRegisterScreen';

export function RegisterScreen() {
  const { t } = useTranslation('auth');
  const vm = useRegisterScreen();

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID="register-screen"
    >
      <Header title={t('header.register')} onBack={vm.onBack} testID="register.header" />
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('register.title')}
        </Text>
        <Text color="textSecondary">{t('register.subtitle')}</Text>
      </View>
      <FormTextField
        control={vm.control}
        name="firstName"
        label={t('register.firstName')}
        autoComplete="given-name"
        returnKeyType="next"
        testID="register.first-name-input"
      />
      <FormTextField
        control={vm.control}
        name="lastName"
        label={t('register.lastName')}
        autoComplete="family-name"
        returnKeyType="next"
        testID="register.last-name-input"
      />
      <FormTextField
        control={vm.control}
        name="username"
        label={t('register.username')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        returnKeyType="next"
        testID="register.username-input"
      />
      <FormTextField
        control={vm.control}
        name="email"
        label={t('register.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="next"
        testID="register.email-input"
      />
      <FormTextField
        control={vm.control}
        name="password"
        label={t('register.password')}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="next"
        testID="register.password-input"
      />
      <FormTextField
        control={vm.control}
        name="confirmPassword"
        label={t('register.confirmPassword')}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={vm.onSubmit}
        testID="register.confirm-password-input"
      />
      <FormError message={vm.errorMessage} testID="register.error" />
      <Button
        title={t('register.submit')}
        fullWidth
        loading={vm.isPending}
        onPress={vm.onSubmit}
        testID="register.submit-button"
      />
    </Screen>
  );
}
