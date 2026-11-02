import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useCurrentUser, useMeQuery } from '@features/auth';
import type { ProfileStackParamList } from '@navigation/types';

/** Logic of the profile screen: the freshest user (query, then stored) and the edit action. */
export function useProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'Profile'>>();
  const { data } = useMeQuery();
  const storedUser = useCurrentUser();
  const user = data ?? storedUser;
  const fullName = user ? `${user.firstName} ${user.lastName}` : '';

  const onEdit = () => {
    navigation.navigate('EditProfile');
  };

  return { user, fullName, onEdit };
}
