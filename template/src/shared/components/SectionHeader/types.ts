export type SectionHeaderAction = Readonly<{
  label: string;
  onPress?: () => void;
  /** Opened through `openUrlSafe` on press. */
  href?: string;
}>;

export type SectionHeaderProps = Readonly<{
  title: string;
  subtitle?: string;
  /** A link at the end of the row, e.g. "See all". */
  action?: SectionHeaderAction;
  testID?: string;
}>;
