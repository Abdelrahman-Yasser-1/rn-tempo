import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AuthStackParamList } from '@navigation/types';
import { getErrorMessageKey } from '@services/http/errors';
import { Button, FormTextField, Header, Screen, Text } from '@shared/components';

import { useForgotPasswordMutation } from '../../api/mutations';
import { ForgotPasswordRequestSchema, type ForgotPasswordRequest } from '../../api/schemas';
import { FormError } from '../../components/FormError';

import { styles } from './styles';

export function ForgotPasswordScreen() {
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
        onBack={navigation.goBack}
        testID="forgot-password.header"
      />
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('forgotPassword.title')}
        </Text>
        <Text color="textSecondary">{t('forgotPassword.subtitle')}</Text>
      </View>
      <FormTextField
        control={control}
        name="email"
        label={t('forgotPassword.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        testID="forgot-password.email-input"
      />
      <FormError message={errorMessage} testID="forgot-password.error" />
      <Button
        title={t('forgotPassword.submit')}
        fullWidth
        loading={forgotPassword.isPending}
        onPress={onSubmit}
        testID="forgot-password.submit-button"
      />
    </Screen>
  );
}
