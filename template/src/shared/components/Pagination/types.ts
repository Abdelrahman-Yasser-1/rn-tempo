export type PaginationProps = Readonly<{
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Pages shown on each side of the current one. Defaults to 1. */
  siblings?: number;
  testID?: string;
}>;
