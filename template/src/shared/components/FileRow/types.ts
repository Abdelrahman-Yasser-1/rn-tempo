import type { PickedFile } from '@services/files/types';

export type FileRowProps = Readonly<{
  file: PickedFile;
  /** Shows a remove button that calls this; omit for a read-only row. */
  onRemove?: () => void;
  /** Applied to the row; the parts add suffixes (`.name`, `.size`, `.remove`). */
  testID?: string;
}>;
