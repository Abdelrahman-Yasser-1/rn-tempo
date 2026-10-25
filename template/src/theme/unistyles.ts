import { StyleSheet } from 'react-native-unistyles';

import { breakpoints } from './breakpoints';
import { darkTheme, lightTheme } from './themes';

const appThemes = { light: lightTheme, dark: darkTheme };

type AppThemes = typeof appThemes;
type AppBreakpoints = typeof breakpoints;

declare module 'react-native-unistyles' {
  // Module augmentation requires `interface`; a type alias cannot be merged.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type -- required by the Unistyles typing contract
  export interface UnistylesThemes extends AppThemes {}
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type -- required by the Unistyles typing contract
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

// Must run before any StyleSheet.create: index.js imports this file first.
// adaptiveThemes follows the OS scheme; useAppTheme turns it off for an explicit preference.
StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: { adaptiveThemes: true },
});
