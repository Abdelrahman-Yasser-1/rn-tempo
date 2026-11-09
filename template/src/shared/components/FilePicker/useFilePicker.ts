import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { rejectFile } from '@services/files/fileRules';
import { useFileSourceSheet } from '@shared/components/FileSourceSheet';

import type { FilePickerProps } from './types';

/** Logic of the file picker: the source sheet, validating the picked file and removing it. */
export function useFilePicker({
  onChange,
  accept,
  maxSizeMB,
}: Pick<FilePickerProps, 'onChange' | 'accept' | 'maxSizeMB'>) {
  const { t } = useTranslation();
  const [validationText, setValidationText] = useState<string>();

  const sheet = useFileSourceSheet({
    accept,
    onPicked: ([file]) => {
      if (file === undefined) {
        return;
      }
      const rejection = rejectFile(file, { accept, maxSizeMB });
      if (rejection === 'type') {
        setValidationText(t(($) => $.filePicker.errorType));
      } else if (rejection === 'size') {
        setValidationText(t(($) => $.filePicker.errorSize, { max: maxSizeMB }));
      } else {
        setValidationText(undefined);
        onChange(file);
      }
    },
  });

  return {
    ...sheet,
    validationText,
    onRemove: () => {
      setValidationText(undefined);
      onChange(null);
    },
  };
}
