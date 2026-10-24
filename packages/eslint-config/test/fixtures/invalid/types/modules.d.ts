// Minimal stand-ins so fixtures type-check without installing React Native.
declare module 'react-native' {
  type Props = {
    children?: import('react').ReactNode;
    testID?: string;
    accessibilityRole?: string;
    onPress?: () => void;
    style?: unknown;
  };
  export const View: import('react').ComponentType<Props>;
  export const Text: import('react').ComponentType<Props>;
  export const Pressable: import('react').ComponentType<Props>;
  export const Image: import('react').ComponentType<Props>;
  export const StyleSheet: { create: <T>(styles: T) => T };
}
declare module 'react-native-unistyles' {
  export const StyleSheet: { create: <T>(styles: T) => T };
}
declare module 'react-native-config' {
  const Config: Record<string, string | undefined>;
  export default Config;
}
declare module 'react-i18next' {
  export function useTranslation(): { t: (key: string) => string };
}
declare module 'axios' {
  const axios: { get: (url: string) => Promise<unknown> };
  export default axios;
}
declare module '@testing-library/react-native' {
  export const screen: {
    getByRole: (role: string) => unknown;
    getByTestId: (id: string) => unknown;
  };
  export function render(element: import('react').ReactElement): void;
}
declare function describe(name: string, run: () => void): void;
declare function it(name: string, run: () => void): void;
declare function expect(value: unknown): {
  toBeTruthy: () => void;
  toContain: (item: string) => void;
};
