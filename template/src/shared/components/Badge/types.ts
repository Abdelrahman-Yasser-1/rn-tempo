export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md';

export type BadgeProps = Readonly<{
  /** Text content. Ignored when `count` is given. */
  label?: string;
  /** Numeric content; shows `${max}+` above `max`. */
  count?: number;
  /** Largest number shown before `+`; defaults to 99. */
  max?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  accessibilityLabel?: string;
  testID?: string;
}>;
