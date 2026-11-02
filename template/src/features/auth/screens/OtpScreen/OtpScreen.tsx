import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AuthStackParamList } from '@navigation/types';
import { Button, OtpInput, Header, Screen, Text } from '@shared/components';

import { OTP_LENGTH } from '../../constants';

import { styles } from './styles';
import { useOtpScreen } from './useOtpScreen';

type OtpScreenProps = Readonly<{ route: RouteProp<AuthStackParamList, 'Otp'> }>;

export function OtpScreen({ route }: OtpScreenProps) {
  const { t } = useTranslation('auth');
  const vm = useOtpScreen(route);

  if (!vm.isValid) {
    return null;
  }

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID="otp-screen"
    >
      <Header title={t('header.otp')} onBack={vm.onBack} testID="otp.header" />
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('otp.title')}
        </Text>
        <Text color="textSecondary">{t('otp.subtitle', { target: vm.maskedTarget })}</Text>
      </View>
      <OtpInput
        value={vm.code}
        onChangeText={vm.onChangeCode}
        onComplete={vm.onComplete}
        length={OTP_LENGTH}
        autoFocus
        disabled={vm.isVerifying}
        errorText={vm.errorMessage}
        testID="otp.input"
      />
      <Button
        variant="ghost"
        title={
          vm.isCooldownRunning
            ? t('otp.resendIn', { seconds: vm.cooldownRemaining })
            : t('otp.resend')
        }
        disabled={vm.isCooldownRunning}
        loading={vm.isResending}
        onPress={vm.onResend}
        testID="otp.resend-button"
      />
    </Screen>
  );
}
