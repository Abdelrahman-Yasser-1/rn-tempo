import Toast from 'react-native-toast-message';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastShowOptions = {
  /** Defaults to `info`. */
  type?: ToastType;
  title: string;
  message?: string;
  /** How long it stays on screen; defaults to 4 seconds. */
  durationMs?: number;
  onPress?: () => void;
};

const DEFAULT_DURATION_MS = 4000;

type Shortcut = (title: string, message?: string) => void;

/** Shows a themed toast; `ToastHost` renders it. */
function show({
  type = 'info',
  title,
  message,
  durationMs = DEFAULT_DURATION_MS,
  onPress,
}: Readonly<ToastShowOptions>): void {
  Toast.show({ type, text1: title, text2: message, visibilityTime: durationMs, onPress });
}

/** Builds `toast.<type>(title, message?)`. */
function shortcut(type: ToastType): Shortcut {
  return (title, message) => {
    show({ type, title, message });
  };
}

/**
 * Imperative toasts, callable from anywhere (hooks, mutations, services). Needs `<ToastHost />`
 * mounted once near the app root. Titles and messages must already be translated.
 */
export const toast = {
  show,
  success: shortcut('success'),
  error: shortcut('error'),
  info: shortcut('info'),
  warning: shortcut('warning'),
  /** Dismisses the visible toast. */
  hide: (): void => {
    Toast.hide();
  },
};
