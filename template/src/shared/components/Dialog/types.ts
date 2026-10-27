export type DialogProps = Readonly<{
  visible: boolean;
  title: string;
  message?: string;
  /** Defaults to a translated "Confirm". */
  confirmLabel?: string;
  /** Defaults to a translated "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /** Disables both buttons and shows a spinner on confirm. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}>;
