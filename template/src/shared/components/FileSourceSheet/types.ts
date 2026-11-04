import type { FileSource, PickedFile } from '@services/files/types';

export type FileSourceSheetProps = Readonly<{
  visible: boolean;
  /** Which sources to list, in order. */
  sources: readonly FileSource[];
  /** Called with the chosen source; the sheet does not close itself, the owner sets `visible`. */
  onSelect: (source: FileSource) => void;
  /** Called after the sheet is dismissed by any means. */
  onClose: () => void;
  title?: string;
  /** Applied to the content; each source adds a suffix (`.camera`, `.library`, `.files`). */
  testID?: string;
}>;

export type UseFileSourceSheetOptions = Readonly<{
  /** MIME types or wildcards the field accepts; decides which sources are offered. */
  accept?: readonly string[];
  multiple?: boolean;
  /** Most photos the library returns when `multiple` is on. */
  limit?: number;
  /** Called with the picked files (never empty) once the native picker returns. */
  onPicked: (files: readonly PickedFile[]) => void;
}>;
