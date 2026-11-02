import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '../store/auth.store';

import { fetchMe } from './auth.api';
import { authKeys } from './keys';

/** The current user from `/auth/me`; fresh results are mirrored into the auth store. */
export function useMeQuery() {
  const query = useQuery({ queryKey: authKeys.me(), queryFn: fetchMe });
  const { data } = query;

  useEffect(() => {
    if (data) {
      useAuthStore.getState().setUser(data);
    }
  }, [data]);

  return query;
}
