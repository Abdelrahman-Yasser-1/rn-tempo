export type ConnectionModalProps = Readonly<{
  /** Turns the guard on; use it only on screens that cannot work offline. Defaults to true. */
  enabled?: boolean;
  /** How long the device must stay offline before the modal appears. Defaults to 5000 ms. */
  delayMs?: number;
  /** Extra work to do when the user taps Retry (the connection check always runs). */
  onRetry?: () => void;
  testID?: string;
}>;
