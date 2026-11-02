import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ENV } from '@config/env';
import type { AuthStackParamList } from '@navigation/types';
import { normalizeError, getErrorMessageKey } from '@services/http/errors';
import { Button, FormTextField, Screen, Text } from '@shared/components';
import { useIsOnline } from '@shared/hooks';

import { useLoginMutation } from '../../api/mutations';
import { LoginRequestSchema, type LoginRequest } from '../../api/schemas';
import { FormError } from '../../components/FormError';
import { DEV_HINT_CREDENTIALS } from '../../constants';

import { styles } from './styles';

type LoginScreenProps = Readonly<NativeStackScreenProps<AuthStackParamList, 'Login'>>;

const INVALID_CREDENTIALS_CODES = new Set(['VALIDATION', 'UNAUTHORIZED']);

export function LoginScreen({ navigation }: LoginScreenProps) {
  const { t } = useTranslation('auth');
  const isOnline = useIsOnline();
  const [isOfflineAttempt, setIsOfflineAttempt] = useState(false);
  const login = useLoginMutation();
  const { control, handleSubmit } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { username: '', password: '' },
  });

  const submit = handleSubmit((values) => {
    if (!isOnline) {
      setIsOfflineAttempt(true);
      return;
    }
    setIsOfflineAttempt(false);
    login.mutate(values);
  });

  const onSubmit = () => {
    void submit();
  };

  const loginError: unknown = login.error;
  const isInvalidCredentials =
    loginError !== null && INVALID_CREDENTIALS_CODES.has(normalizeError(loginError).code);
  let errorMessage: string | undefined;
  if (isOfflineAttempt) {
    errorMessage = t('network', { ns: 'errors' });
  } else if (loginError !== null) {
    errorMessage = isInvalidCredentials
      ? t('login.invalidCredentials')
      : t(getErrorMessageKey(loginError), { ns: 'errors' });
  }

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID="login-screen"
    >
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('login.title')}
        </Text>
        <Text color="textSecondary">{t('login.subtitle')}</Text>
      </View>
      <FormTextField
        control={control}
        name="username"
        label={t('login.username')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        returnKeyType="next"
        testID="login.username-input"
      />
      <FormTextField
        control={control}
        name="password"
        label={t('login.password')}
        secureTextEntry
        autoComplete="current-password"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        testID="login.password-input"
      />
      <FormError message={errorMessage} testID="login.error" />
      <Button
        title={t('login.submit')}
        fullWidth
        loading={login.isPending}
        onPress={onSubmit}
        testID="login.submit-button"
      />
      <View style={styles.links}>
        <Button
          variant="ghost"
          title={t('login.forgotPassword')}
          onPress={() => {
            navigation.navigate('ForgotPassword');
          }}
          testID="login.forgot-password-link"
        />
        <Button
          variant="ghost"
          title={t('login.createAccount')}
          onPress={() => {
            navigation.navigate('Register');
          }}
          testID="login.register-link"
        />
      </View>
      {__DEV__ && ENV.API_MOCKING && (
        <Text variant="caption" color="textSecondary" align="center" testID="login.dev-hint">
          {t('login.devHint', DEV_HINT_CREDENTIALS)}
        </Text>
      )}
    </Screen>
  );
}
