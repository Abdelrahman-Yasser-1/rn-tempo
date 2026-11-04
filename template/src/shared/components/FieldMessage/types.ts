export type FieldMessageVariant = 'helper' | 'error';

export type FieldMessageProps = Readonly<{
  message: string;
  /** `error` is red, shows an alert icon and is announced politely. Defaults to `helper`. */
  variant?: FieldMessageVariant;
  /** Applied to the message text. */
  testID?: string;
}>;
