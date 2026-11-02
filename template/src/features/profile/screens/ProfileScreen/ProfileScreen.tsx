import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Avatar, Button, Header, Screen, Text } from '@shared/components';

import { styles } from './styles';
import { useProfileScreen } from './useProfileScreen';

export function ProfileScreen() {
  const { t } = useTranslation('profile');
  const { user, fullName, onEdit } = useProfileScreen();

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
        <Button title={t('edit')} fullWidth onPress={onEdit} testID="profile.edit-button" />
      </View>
    </Screen>
  );
}
