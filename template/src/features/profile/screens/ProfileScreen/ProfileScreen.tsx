import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCurrentUser, useMeQuery } from '@features/auth';
import type { ProfileStackParamList } from '@navigation/types';
import { Avatar, Button, Header, Screen, Text } from '@shared/components';

import { styles } from './styles';

type ProfileScreenProps = Readonly<NativeStackScreenProps<ProfileStackParamList, 'Profile'>>;

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { t } = useTranslation('profile');
  const { data } = useMeQuery();
  const storedUser = useCurrentUser();
  const user = data ?? storedUser;
  const fullName = user ? `${user.firstName} ${user.lastName}` : '';

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="profile-screen">
      <Header title={t('title')} testID="profile.header" />
      <View style={styles.body}>
        <Avatar
          size="xl"
          source={user?.image ? { uri: user.image } : undefined}
          name={fullName}
          accessibilityLabel={t('avatarLabel')}
          testID="profile.avatar"
        />
        <View style={styles.details}>
          <Text variant="h2" align="center" testID="profile.name">
            {fullName}
          </Text>
          <Text color="textSecondary" align="center" testID="profile.email">
            {user?.email}
          </Text>
        </View>
        <Button
          title={t('edit')}
          fullWidth
          onPress={() => {
            navigation.navigate('EditProfile');
          }}
          testID="profile.edit-button"
        />
      </View>
    </Screen>
  );
}
