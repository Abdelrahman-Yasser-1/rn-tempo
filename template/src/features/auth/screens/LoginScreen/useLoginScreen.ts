import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useLoginMutation } from '@features/auth/api/mutations';
import { LoginRequestSchema, type LoginRequest } from '@features/auth/api/schemas';
import type { AuthStackParamList } from '@navigation/types';
import { normalizeError, getErrorMessageKey } from '@services/http/errors';
import { useIsOnline } from '@shared/hooks';

const INVALID_CREDENTIALS_CODES = new Set(['VALIDATION', 'UNAUTHORIZED']);

/** Logic of the login screen: form, offline guard, error mapping and navigation links. */
export function useLoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Login'>>();
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

  const onForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  const onRegister = () => {
    navigation.navigate('Register');
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

  return {
    control,
    errorMessage,
    isPending: login.isPending,
    onSubmit,
    onForgotPassword,
    onRegister,
  };
}
