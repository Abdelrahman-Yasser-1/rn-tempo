import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AuthStackParamList } from '@navigation/types';
import { getErrorMessageKey } from '@services/http/errors';
import { toast } from '@services/toast/toast';
import { Button, OtpInput, Header, Screen, Text } from '@shared/components';
import { useCountdown } from '@shared/hooks';
import { maskEmail } from '@shared/utils';

import { useResendOtpMutation, useVerifyOtpMutation } from '../../api/mutations';
import { OtpRouteParamsSchema, type OtpPurpose } from '../../api/schemas';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '../../constants';

import { styles } from './styles';

type OtpScreenProps = Readonly<NativeStackScreenProps<AuthStackParamList, 'Otp'>>;

type OtpFormProps = Readonly<{
  navigation: OtpScreenProps['navigation'];
  target: string;
  purpose: OtpPurpose;
}>;

/** Guards against missing or forged deep-link params; only parsed values reach the form. */
export function OtpScreen({ navigation, route }: OtpScreenProps) {
  const params = OtpRouteParamsSchema.safeParse(route.params);
  const isValid = params.success;

  useEffect(() => {
    if (!isValid) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [isValid, navigation]);

  if (!params.success) {
    return null;
  }
  return (
    <OtpForm navigation={navigation} target={params.data.target} purpose={params.data.purpose} />
  );
}

function OtpForm({ navigation, target, purpose }: OtpFormProps) {
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [isCodeRejected, setIsCodeRejected] = useState(false);
  // A fresh object per (re)start, so the effect below also re-runs when the length is unchanged.
  const [cooldown, setCooldown] = useState({ seconds: OTP_RESEND_SECONDS });
  const { remaining, isRunning, start, reset } = useCountdown(cooldown.seconds);
  const verify = useVerifyOtpMutation();
  const resend = useResendOtpMutation();

  useEffect(() => {
    reset();
    start();
  }, [cooldown, reset, start]);

  const handleComplete = (value: string) => {
    setIsCodeRejected(false);
    verify.mutate(
      { target, code: value, purpose },
      {
        onSuccess: (result) => {
          if (!result.success) {
            setIsCodeRejected(true);
            setCode('');
            return;
          }
          toast.show({
            type: 'success',
            title: t(purpose === 'register' ? 'otp.registeredTitle' : 'otp.resetTitle'),
          });
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
        onError: () => {
          setCode('');
        },
      },
    );
  };

  const handleResend = () => {
    resend.mutate(
      { target, purpose },
      {
        onSuccess: ({ retryAfterSec }) => {
          setIsCodeRejected(false);
          setCode('');
          setCooldown({ seconds: retryAfterSec });
        },
      },
    );
  };

  const verifyError: unknown = verify.error;
  const resendError: unknown = resend.error;
  const requestError = verifyError ?? resendError;
  let errorText: string | undefined;
  if (isCodeRejected) {
    errorText = t('otp.invalidCode');
  } else if (requestError !== null) {
    errorText = t(getErrorMessageKey(requestError), { ns: 'errors' });
  }

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID="otp-screen"
    >
      <Header title={t('header.otp')} onBack={navigation.goBack} testID="otp.header" />
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('otp.title')}
        </Text>
        <Text color="textSecondary">{t('otp.subtitle', { target: maskEmail(target) })}</Text>
      </View>
      <OtpInput
        value={code}
        onChangeText={setCode}
        onComplete={handleComplete}
        length={OTP_LENGTH}
        autoFocus
        disabled={verify.isPending}
        errorText={errorText}
        testID="otp.input"
      />
      <Button
        variant="ghost"
        title={isRunning ? t('otp.resendIn', { seconds: remaining }) : t('otp.resend')}
        disabled={isRunning}
        loading={resend.isPending}
        onPress={handleResend}
        testID="otp.resend-button"
      />
    </Screen>
  );
}
