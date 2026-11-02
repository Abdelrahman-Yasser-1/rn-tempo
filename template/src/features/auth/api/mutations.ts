import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../store/auth.store';

import { forgotPassword, login, register, resendOtp, verifyOtp } from './auth.api';
import { authKeys } from './keys';

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: async ({ accessToken, refreshToken, ...user }) => {
      // Seed the cache first: signing in switches the navigator to screens that read it.
      queryClient.setQueryData(authKeys.me(), user);
      await useAuthStore.getState().signIn({ accessToken, refreshToken }, user);
    },
  });
}

export function useRegisterMutation() {
  return useMutation({ mutationFn: register });
}

export function useForgotPasswordMutation() {
  return useMutation({ mutationFn: forgotPassword });
}

export function useVerifyOtpMutation() {
  return useMutation({ mutationFn: verifyOtp });
}

export function useResendOtpMutation() {
  return useMutation({ mutationFn: resendOtp });
}
