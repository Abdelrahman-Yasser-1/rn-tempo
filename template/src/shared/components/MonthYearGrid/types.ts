export type MonthYearGridProps = Readonly<{
  /** Year the grid opens on; the year list scrolls to it. */
  year: number;
  /** Selected month, 0 (January) to 11. */
  month?: number;
  /** Called when a month is tapped, with the year being browsed. */
  onSelect: (year: number, month: number) => void;
  /** Earliest selectable month as `YYYY-MM`. */
  minMonth?: string;
  /** Latest selectable month as `YYYY-MM`. */
  maxMonth?: string;
  /** Applied to the grid; the parts add suffixes (`.month.<0-11>`, `.year.<yyyy>`). */
  testID?: string;
}>;
