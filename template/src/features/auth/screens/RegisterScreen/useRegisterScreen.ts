import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AuthStackParamList } from '@navigation/types';
import { getErrorMessageKey } from '@services/http/errors';

import { useRegisterMutation } from '../../api/mutations';
import { RegisterRequestSchema, type RegisterRequest } from '../../api/schemas';

/** Logic of the register screen: form, submit, error mapping and the hand-off to OTP. */
export function useRegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Register'>>();
  const { t } = useTranslation('auth');
  const register = useRegisterMutation();
  const { control, handleSubmit } = useForm<RegisterRequest>({
    resolver: zodResolver(RegisterRequestSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const submit = handleSubmit((values) => {
    register.mutate(values, {
      onSuccess: () => {
        navigation.navigate('Otp', { target: values.email, purpose: 'register' });
      },
    });
  });

  const onSubmit = () => {
    void submit();
  };

  const registerError: unknown = register.error;
  const errorMessage =
    registerError === null ? undefined : t(getErrorMessageKey(registerError), { ns: 'errors' });

  return {
    control,
    errorMessage,
    isPending: register.isPending,
    onSubmit,
    onBack: navigation.goBack,
  };
}
