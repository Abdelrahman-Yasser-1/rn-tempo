import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCurrentUser } from '@features/auth';
import type { ProfileStackParamList } from '@navigation/types';
import { Button, FormTextField, Header, Screen } from '@shared/components';

import { useUpdateProfileMutation } from '../../api/mutations';
import { UpdateProfileSchema, type UpdateProfile } from '../../api/schemas';

import { styles } from './styles';

export function EditProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'EditProfile'>>();
  const { t } = useTranslation('profile');
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

  return (
    <Screen
      preset="scroll"
      keyboardAware
      contentContainerStyle={styles.content}
      testID="edit-profile-screen"
    >
      <Header title={t('editTitle')} onBack={navigation.goBack} testID="edit-profile.header" />
      <FormTextField
        control={control}
        name="firstName"
        label={t('firstName')}
        autoComplete="given-name"
        returnKeyType="next"
        testID="edit-profile.first-name-input"
      />
      <FormTextField
        control={control}
        name="lastName"
        label={t('lastName')}
        autoComplete="family-name"
        returnKeyType="next"
        testID="edit-profile.last-name-input"
      />
      <FormTextField
        control={control}
        name="email"
        label={t('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        testID="edit-profile.email-input"
      />
      <Button
        title={t('save')}
        fullWidth
        loading={updateProfile.isPending}
        onPress={onSubmit}
        testID="edit-profile.save-button"
      />
    </Screen>
  );
}
