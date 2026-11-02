import { CommonActions, useNavigation } from '@react-navigation/native';

import { useAuthStatus } from '@features/auth';

/** Logic of the not-found screen: reset to the root that matches the session. */
export function useNotFoundScreen() {
  const navigation = useNavigation();
  const status = useAuthStatus();

  const goHome = (): void => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: status === 'signedIn' ? 'Main' : 'Auth' }],
      }),
    );
  };

  return { goHome };
}
