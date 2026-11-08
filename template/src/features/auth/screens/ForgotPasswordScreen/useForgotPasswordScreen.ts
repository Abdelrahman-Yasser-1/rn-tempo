import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useForgotPasswordMutation } from '@features/auth/api/mutations';
import {
  ForgotPasswordRequestSchema,
  type ForgotPasswordRequest,
} from '@features/auth/api/schemas';
import type { AuthStackParamList } from '@navigation/types';
import { getErrorMessageKey } from '@services/http/errors';

/** Logic of the forgot-password screen: form, submit, error mapping and the hand-off to OTP. */
export function useForgotPasswordScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>>();
  const { t } = useTranslation('auth');
  const forgotPassword = useForgotPasswordMutation();
  const { control, handleSubmit } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit((values) => {
    forgotPassword.mutate(values, {
      onSuccess: () => {
        navigation.navigate('Otp', { target: values.email, purpose: 'reset-password' });
      },
    });
  });

  const onSubmit = () => {
    void submit();
  };

  const requestError: unknown = forgotPassword.error;
  const errorMessage =
    requestError === null ? undefined : t(getErrorMessageKey(requestError), { ns: 'errors' });

  return {
    control,
    errorMessage,
    isPending: forgotPassword.isPending,
    onSubmit,
    onBack: navigation.goBack,
  };
}
