import { useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useResendOtpMutation, useVerifyOtpMutation } from '@features/auth/api/mutations';
import { OtpRouteParamsSchema } from '@features/auth/api/schemas';
import { OTP_RESEND_SECONDS } from '@features/auth/constants';
import type { AuthStackParamList } from '@navigation/types';
import { getErrorMessageKey } from '@services/http/errors';
import { toast } from '@services/toast/toast';
import { useCountdown } from '@shared/hooks';
import { maskEmail } from '@shared/utils';

type OtpRoute = RouteProp<AuthStackParamList, 'Otp'>;

/**
 * Logic of the OTP screen. Guards against missing or forged deep-link params: an invalid route
 * resets to Login and `isValid` is false, so the view renders nothing.
 */
export function useOtpScreen(route: OtpRoute) {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Otp'>>();
  const { t } = useTranslation('auth');
  const params = OtpRouteParamsSchema.safeParse(route.params);
  const isValid = params.success;
  const target = params.success ? params.data.target : '';
  const purpose = params.success ? params.data.purpose : 'register';
  const [code, setCode] = useState('');
  const [isCodeRejected, setIsCodeRejected] = useState(false);
  // A fresh object per (re)start, so the effect below also re-runs when the length is unchanged.
  const [cooldown, setCooldown] = useState({ seconds: OTP_RESEND_SECONDS });
  const { remaining, isRunning, start, reset } = useCountdown(cooldown.seconds);
  const verify = useVerifyOtpMutation();
  const resend = useResendOtpMutation();

  useEffect(() => {
    if (!isValid) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [isValid, navigation]);

  useEffect(() => {
    reset();
    start();
  }, [cooldown, reset, start]);

  const onComplete = (value: string) => {
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
            title:
              purpose === 'register' ? t(($) => $.otp.registeredTitle) : t(($) => $.otp.resetTitle),
          });
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
        onError: () => {
          setCode('');
        },
      },
    );
  };

  const onResend = () => {
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
  let errorMessage: string | undefined;
  if (isCodeRejected) {
    errorMessage = t(($) => $.otp.invalidCode);
  } else if (requestError !== null) {
    errorMessage = t(getErrorMessageKey(requestError), { ns: 'errors' });
  }

  return {
    isValid,
    code,
    maskedTarget: maskEmail(target),
    errorMessage,
    isVerifying: verify.isPending,
    isResending: resend.isPending,
    isCooldownRunning: isRunning,
    cooldownRemaining: remaining,
    onChangeCode: setCode,
    onComplete,
    onResend,
    onBack: navigation.goBack,
  };
}
