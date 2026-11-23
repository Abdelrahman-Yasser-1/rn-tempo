import NativeAppIcon from './NativeAppIcon';

const nativeNames = { default: null, ocean: 'Ocean', forest: 'Forest', sunset: 'Sunset' } as const;

export type AppIconName = keyof typeof nativeNames;

export const appIconService = {
  /** Whether the system can switch launcher icons in this build. */
  isSupported: (): boolean => NativeAppIcon?.isSupported() ?? false,

  /** Read the persisted system selection, including after a cold start. */
  async getIcon(): Promise<AppIconName> {
    if (!NativeAppIcon?.isSupported()) {
      return 'default';
    }
    const name = await NativeAppIcon.getIcon();
    if (name === null) {
      return 'default';
    }
    if (name === nativeNames.ocean) {
      return 'ocean';
    }
    if (name === nativeNames.forest) {
      return 'forest';
    }
    if (name === nativeNames.sunset) {
      return 'sunset';
    }
    throw new Error('Unknown native app icon');
  },

  /** Apply a bundled alternate or restore the primary icon. */
  async setIcon(name: AppIconName): Promise<void> {
    if (!NativeAppIcon?.isSupported()) {
      throw new Error('Alternate app icons are unsupported');
    }
    await NativeAppIcon.setIcon(nativeNames[name]);
  },
};
