import type { PickedFile } from '@services/files/types';
import type { PickerFieldProps } from '@shared/components/PickerField';

export type MultiFilePickerProps = Readonly<
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
    value: readonly PickedFile[];
    /** Called with the full new list after files are added or removed. */
    onChange: (files: PickedFile[]) => void;
    /** MIME types or wildcards to allow, such as `['application/pdf', 'image/*']`; everything by default. */
    accept?: readonly string[];
    /** Largest size of one file in megabytes; a bigger one is skipped with an error message. */
    maxSizeMB?: number;
    /** Most files the list can hold; the field is disabled once it is full. */
    maxFiles?: number;
    /** Shown instead of the count when `helperText` is not given and there is no `maxFiles`; defaults to "Add files". */
    placeholder?: string;
    /** Title of the source sheet; defaults to a translated "Add a file". */
    sheetTitle?: string;
    /** Applied to the field; the parts add suffixes (`.file.<index>`, `.sheet`, `.value`, `.label`, `.helper`, `.error`). */
    testID?: string;
  }
>;
