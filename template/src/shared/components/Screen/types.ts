import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import type { SpacingKey } from '@theme/tokens';

export type ScreenPreset = 'fixed' | 'scroll';
export type ScreenStatusBarStyle = 'auto' | 'light' | 'dark';

export type ScreenProps = Readonly<{
  /** `fixed` lays children out in a plain View, `scroll` wraps them in a ScrollView. */
  preset?: ScreenPreset;
  /** Safe-area edges to inset; defaults to top and bottom. */
  safeAreaEdges?: readonly Edge[];
  /** Wraps content in a KeyboardAvoidingView. */
  keyboardAware?: boolean;
  /** `auto` picks light or dark content from the active theme. */
  statusBarStyle?: ScreenStatusBarStyle;
  /** Inner padding as a spacing token. */
  padding?: SpacingKey;
  /** Style for the content (the ScrollView content container when scrolling). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Screen root testID, `<screen-kebab>-screen` (C14). */
  testID?: string;
  children?: ReactNode;
}>;
