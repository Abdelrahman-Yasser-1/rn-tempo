import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AuthStackParamList } from '@navigation/types';
import { getErrorMessageKey } from '@services/http/errors';
import { Button, FormTextField, Screen, Text } from '@shared/components';

import { useRegisterMutation } from '../../api/mutations';
import { RegisterRequestSchema, type RegisterRequest } from '../../api/schemas';
import { FormError } from '../../components/FormError';

import { styles } from './styles';

type RegisterScreenProps = Readonly<NativeStackScreenProps<AuthStackParamList, 'Register'>>;

export function RegisterScreen({ navigation }: RegisterScreenProps) {
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

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID="register-screen"
    >
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('register.title')}
        </Text>
        <Text color="textSecondary">{t('register.subtitle')}</Text>
      </View>
      <FormTextField
        control={control}
        name="firstName"
        label={t('register.firstName')}
        autoComplete="given-name"
        returnKeyType="next"
        testID="register.first-name-input"
      />
      <FormTextField
        control={control}
        name="lastName"
        label={t('register.lastName')}
        autoComplete="family-name"
        returnKeyType="next"
        testID="register.last-name-input"
      />
      <FormTextField
        control={control}
        name="username"
        label={t('register.username')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        returnKeyType="next"
        testID="register.username-input"
      />
      <FormTextField
        control={control}
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
        control={control}
        name="password"
        label={t('register.password')}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="next"
        testID="register.password-input"
      />
      <FormTextField
        control={control}
        name="confirmPassword"
        label={t('register.confirmPassword')}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        testID="register.confirm-password-input"
      />
      <FormError message={errorMessage} testID="register.error" />
      <Button
        title={t('register.submit')}
        fullWidth
        loading={register.isPending}
        onPress={onSubmit}
        testID="register.submit-button"
      />
    </Screen>
  );
}
