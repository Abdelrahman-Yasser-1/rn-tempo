import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, FormTextField, Header, Screen, Text } from '@shared/components';

import { FormError } from '../../components/FormError';

import { styles } from './styles';
import { useForgotPasswordScreen } from './useForgotPasswordScreen';

export function ForgotPasswordScreen() {
  const { t } = useTranslation('auth');
  const vm = useForgotPasswordScreen();

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID="forgot-password-screen"
    >
      <Header
        title={t('header.forgotPassword')}
        onBack={vm.onBack}
        testID="forgot-password.header"
      />
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('forgotPassword.title')}
        </Text>
        <Text color="textSecondary">{t('forgotPassword.subtitle')}</Text>
      </View>
      <FormTextField
        control={vm.control}
        name="email"
        label={t('forgotPassword.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={vm.onSubmit}
        testID="forgot-password.email-input"
      />
      <FormError message={vm.errorMessage} testID="forgot-password.error" />
      <Button
        title={t('forgotPassword.submit')}
        fullWidth
        loading={vm.isPending}
        onPress={vm.onSubmit}
        testID="forgot-password.submit-button"
      />
    </Screen>
  );
}
