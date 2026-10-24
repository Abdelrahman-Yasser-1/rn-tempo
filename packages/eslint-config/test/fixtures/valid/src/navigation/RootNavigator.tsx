import { HomeScreen } from '@features/home';

import type { RootStackParamList } from './types';

export const initialRoute: keyof RootStackParamList = 'Home';

export function RootNavigator() {
  return <HomeScreen />;
}
