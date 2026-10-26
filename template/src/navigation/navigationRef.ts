import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/** Imperative navigation for code outside React (notifications, interceptors). */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
