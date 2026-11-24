import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { HomeStackParamList } from '@navigation/types';
import { useCmsEntries } from '@services/cms';
import { openUrlSafe } from '@services/linking/linking';

/** Logic of What's new: the announcements in the app language, back navigation and links. */
export function useWhatsNewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'WhatsNew'>>();
  const announcementsQuery = useCmsEntries('announcement');

  const onOpenLink = (url: string) => {
    void openUrlSafe(url);
  };

  return { announcementsQuery, onOpenLink, onBack: navigation.goBack };
}
