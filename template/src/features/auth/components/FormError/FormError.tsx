import { Text } from '@shared/components';

type FormErrorProps = Readonly<{
  /** Already translated message; renders nothing when empty. */
  message?: string;
  testID: string;
}>;

/** Inline form-level error announced politely to screen readers. */
export function FormError({ message, testID }: FormErrorProps) {
  if (message === undefined) {
    return null;
  }
  return (
    <Text
      testID={testID}
      variant="bodySmall"
      color="error"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}
