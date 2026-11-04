import Toast from 'react-native-toast-message';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastAction = Readonly<{
  /** Already translated. */
  label: string;
  /** Runs when the action is pressed; the toast is dismissed afterwards. */
  onPress: () => void;
}>;

/** What `ToastHost` reads back from the library's `props` for the custom layout. */
export type ToastExtras = Readonly<{
  actions?: readonly ToastAction[];
  isClosable?: boolean;
}>;

export type ToastShowOptions = {
  /** Defaults to `info`. */
  type?: ToastType;
  title: string;
  description?: string;
  /** Buttons under the text; at most two are shown. */
  actions?: readonly ToastAction[];
  /** Shows a close button. */
  isClosable?: boolean;
  /** Stays until dismissed (close button, an action or a swipe) instead of hiding itself. */
  isFixed?: boolean;
  /** How long it stays on screen; defaults to 4 seconds. Ignored when `isFixed`. */
  durationMs?: number;
  onPress?: () => void;
};

const DEFAULT_DURATION_MS = 4000;

type Shortcut = (title: string, description?: string) => void;

/** Shows a themed toast; `ToastHost` renders it. */
function show({
  type = 'info',
  title,
  description,
  actions,
  isClosable,
  isFixed = false,
  durationMs = DEFAULT_DURATION_MS,
  onPress,
}: Readonly<ToastShowOptions>): void {
  const extras: ToastExtras = { actions, isClosable };
  Toast.show({
    type,
    text1: title,
    text2: description,
    visibilityTime: durationMs,
    autoHide: !isFixed,
    onPress,
    props: extras,
  });
}

/** Builds `toast.<type>(title, description?)`. */
function shortcut(type: ToastType): Shortcut {
  return (title, description) => {
    show({ type, title, description });
  };
}

/**
 * Imperative toasts, callable from anywhere (hooks, mutations, services). Needs `<ToastHost />`
 * mounted once near the app root. Titles and descriptions must already be translated.
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
