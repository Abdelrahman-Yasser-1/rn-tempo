import BootSplash from 'react-native-bootsplash';

/** Bootstrap step 8: fade the native splash out. */
export function hideSplash(): Promise<void> {
  return BootSplash.hide({ fade: true });
}
