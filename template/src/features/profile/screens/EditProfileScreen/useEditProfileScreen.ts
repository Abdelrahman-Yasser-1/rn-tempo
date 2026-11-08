import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';

import { useCurrentUser } from '@features/auth';
import { useUpdateProfileMutation } from '@features/profile/api/mutations';
import { UpdateProfileSchema, type UpdateProfile } from '@features/profile/api/schemas';
import type { ProfileStackParamList } from '@navigation/types';

/** Logic of the edit-profile screen: form prefilled from the user and optimistic save. */
export function useEditProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'EditProfile'>>();
  const user = useCurrentUser();
  const updateProfile = useUpdateProfileMutation();
  const { control, handleSubmit } = useForm<UpdateProfile>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
    },
  });

  const submit = handleSubmit((values) => {
    // The cache updates optimistically, so go back right away; a failure rolls it back with a toast.
    updateProfile.mutate(values);
    navigation.goBack();
  });

  const onSubmit = () => {
    void submit();
  };

  return { control, isPending: updateProfile.isPending, onSubmit, onBack: navigation.goBack };
}
