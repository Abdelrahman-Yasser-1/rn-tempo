export type InlineMessageVariant = 'info' | 'success' | 'warning' | 'error';

export type InlineMessageAction = Readonly<{
  label: string;
  onPress?: () => void;
  /** Opened through `openUrlSafe` on press. */
  href?: string;
}>;

export type InlineMessageProps = Readonly<{
  variant?: InlineMessageVariant;
  title: string;
  description?: string;
  /** A link under the text, e.g. "Learn more". */
  action?: InlineMessageAction;
  /** Shows a dismiss button that calls this. */
  onClose?: () => void;
  testID?: string;
}>;
