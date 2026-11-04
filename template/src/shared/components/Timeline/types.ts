export type TimelineStatus = 'done' | 'current' | 'upcoming';

export type TimelineItem = Readonly<{
  key: string;
  title: string;
  description?: string;
  /** Already formatted, e.g. "12 Nov, 10:30". */
  timestamp?: string;
  status: TimelineStatus;
}>;

export type TimelineProps = Readonly<{
  items: readonly TimelineItem[];
  /** Applied to the list; items use `${testID}.${key}`. */
  testID?: string;
}>;
