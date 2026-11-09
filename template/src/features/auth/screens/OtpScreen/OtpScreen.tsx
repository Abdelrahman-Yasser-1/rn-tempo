import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { OTP_LENGTH } from '@features/auth/constants';
import type { AuthStackParamList } from '@navigation/types';
import { AuthLayout, Button, OtpInput } from '@shared/components';

import { useOtpScreen } from './useOtpScreen';

type OtpScreenProps = Readonly<{ route: RouteProp<AuthStackParamList, 'Otp'> }>;

export function OtpScreen({ route }: OtpScreenProps) {
  const { t } = useTranslation('auth');
  const vm = useOtpScreen(route);

  if (!vm.isValid) {
    return null;
  }

  return (
    <AuthLayout
      headerTitle={t(($) => $.header.otp)}
      onBack={vm.onBack}
      title={t(($) => $.otp.title)}
      subtitle={t(($) => $.otp.subtitle, { target: vm.maskedTarget })}
      testID="otp-screen"
    >
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
            ? t(($) => $.otp.resendIn, { seconds: vm.cooldownRemaining })
            : t(($) => $.otp.resend)
        }
        disabled={vm.isCooldownRunning}
        loading={vm.isResending}
        onPress={vm.onResend}
        testID="otp.resend-button"
      />
    </AuthLayout>
  );
}
