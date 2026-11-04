import { useTranslation } from 'react-i18next';

import { AuthLayout, Button, FormTextField } from '@shared/components';

import { FormError } from '../../components/FormError';

import { useForgotPasswordScreen } from './useForgotPasswordScreen';

export function ForgotPasswordScreen() {
  const { t } = useTranslation('auth');
  const vm = useForgotPasswordScreen();

  return (
    <AuthLayout
      headerTitle={t('header.forgotPassword')}
      onBack={vm.onBack}
      title={t('forgotPassword.title')}
      subtitle={t('forgotPassword.subtitle')}
      testID="forgot-password-screen"
    >
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
    </AuthLayout>
  );
}
