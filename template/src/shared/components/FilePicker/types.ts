import type { PickedFile } from '@services/files/types';
import type { PickerFieldProps } from '@shared/components/PickerField';

export type FilePickerProps = Readonly<
  Pick<
    PickerFieldProps,
    | 'label'
    | 'required'
    | 'subLabel'
    | 'tooltip'
    | 'helperText'
    | 'errorText'
    | 'disabled'
    | 'readOnly'
  > & {
    /** The chosen file, or `null`/`undefined` when there is none. */
    value?: PickedFile | null;
    /** Called with the new file, or `null` when the user removes it. */
    onChange: (file: PickedFile | null) => void;
    /** MIME types or wildcards to allow, such as `['application/pdf', 'image/*']`; everything by default. */
    accept?: readonly string[];
    /** Largest file in megabytes; a bigger one is refused with an error message. */
    maxSizeMB?: number;
    /** Shown when there is no file; defaults to a translated "Choose a file". */
    placeholder?: string;
    /** Title of the source sheet; defaults to a translated "Add a file". */
    sheetTitle?: string;
    /** Applied to the field; the parts add suffixes (`.file`, `.sheet`, `.value`, `.label`, `.helper`, `.error`). */
    testID?: string;
  }
>;
