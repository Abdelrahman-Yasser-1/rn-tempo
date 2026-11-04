export type StatusIndicatorStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type StatusIndicatorSize = 'sm' | 'md';

export type StatusIndicatorProps = Readonly<{
  status: StatusIndicatorStatus;
  label: string;
  size?: StatusIndicatorSize;
  testID?: string;
}>;
