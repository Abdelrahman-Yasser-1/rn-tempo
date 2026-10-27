export type OTPInputProps = Readonly<{
  /** Current code; digits only, at most `length` characters. */
  value: string;
  onChangeText: (value: string) => void;
  /** Called once when every cell is filled. */
  onComplete?: (value: string) => void;
  /** Number of cells; defaults to 6. */
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Error message shown below the cells and announced politely. */
  errorText?: string;
  testID?: string;
}>;
