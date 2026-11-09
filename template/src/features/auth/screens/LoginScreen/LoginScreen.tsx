import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ENV } from '@config/env';
import { FormError } from '@features/auth/components/FormError';
import { DEV_HINT_CREDENTIALS } from '@features/auth/constants';
import { AuthLayout, Button, FormTextField, Text } from '@shared/components';

import { styles } from './styles';
import { useLoginScreen } from './useLoginScreen';

export function LoginScreen() {
  const { t } = useTranslation('auth');
  const vm = useLoginScreen();

  return (
    <AuthLayout
      title={t(($) => $.login.title)}
      subtitle={t(($) => $.login.subtitle)}
      footer={
        <>
          <View style={styles.links}>
            <Button
              variant="ghost"
              title={t(($) => $.login.forgotPassword)}
              onPress={vm.onForgotPassword}
              testID="login.forgot-password-link"
            />
            <Button
              variant="ghost"
              title={t(($) => $.login.createAccount)}
              onPress={vm.onRegister}
              testID="login.register-link"
            />
          </View>
          {__DEV__ && ENV.API_MOCKING && (
            <Text variant="caption" color="textSecondary" align="center" testID="login.dev-hint">
              {t(($) => $.login.devHint, DEV_HINT_CREDENTIALS)}
            </Text>
          )}
        </>
      }
      testID="login-screen"
    >
      <FormTextField
        control={vm.control}
        name="username"
        label={t(($) => $.login.username)}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        returnKeyType="next"
        testID="login.username-input"
      />
      <FormTextField
        control={vm.control}
        name="password"
        label={t(($) => $.login.password)}
        secureTextEntry
        autoComplete="current-password"
        returnKeyType="done"
        onSubmitEditing={vm.onSubmit}
        testID="login.password-input"
      />
      <FormError message={vm.errorMessage} testID="login.error" />
      <Button
        title={t(($) => $.login.submit)}
        fullWidth
        loading={vm.isPending}
        onPress={vm.onSubmit}
        testID="login.submit-button"
      />
    </AuthLayout>
  );
}
