import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { authKeys, useAuthStore, type User } from '@features/auth';
import { getErrorMessageKey } from '@services/http/errors';
import { toast } from '@services/toast/toast';

import { updateProfile } from './profile.api';
import type { UpdateProfile } from './schemas';

type UpdateContext = Readonly<{ previous: User | undefined }>;

/** Edits the signed-in user's profile with an optimistic cache update and rollback on failure. */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<User, unknown, UpdateProfile, UpdateContext>({
    mutationFn: (values) => {
      const user = useAuthStore.getState().user;
      if (user === null) {
        throw new Error('Cannot update the profile while signed out');
      }
      return updateProfile(user.id, values);
    },
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: authKeys.me() });
      const previous =
        queryClient.getQueryData<User>(authKeys.me()) ?? useAuthStore.getState().user ?? undefined;
      queryClient.setQueryData<User>(authKeys.me(), (old) => (old ? { ...old, ...values } : old));
      if (previous) {
        useAuthStore.getState().setUser({ ...previous, ...values });
      }
      return { previous };
    },
    onError: (error, _values, context) => {
      if (context?.previous) {
        queryClient.setQueryData(authKeys.me(), context.previous);
        useAuthStore.getState().setUser(context.previous);
      }
      toast.show({ type: 'error', title: t(getErrorMessageKey(error), { ns: 'errors' }) });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
      useAuthStore.getState().setUser(user);
    },
    // No invalidation on settle: dummyjson does not persist edits, so a refetch would undo them.
  });
}
