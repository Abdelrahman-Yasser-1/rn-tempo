import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { rejectFile } from '@services/files/fileRules';
import type { PickedFile } from '@services/files/types';
import { useFileSourceSheet } from '@shared/components/FileSourceSheet';

import type { MultiFilePickerProps } from './types';

/**
 * Logic of the multiple file picker: adds the accepted files (skipping duplicates, oversize and
 * wrong types, and stopping at `maxFiles`), reports the first problem, and removes files.
 */
export function useMultiFilePicker({
  value,
  onChange,
  accept,
  maxSizeMB,
  maxFiles,
}: Pick<MultiFilePickerProps, 'value' | 'onChange' | 'accept' | 'maxSizeMB' | 'maxFiles'>) {
  const { t } = useTranslation();
  const [validationText, setValidationText] = useState<string>();
  const room = maxFiles === undefined ? undefined : Math.max(0, maxFiles - value.length);

  const sheet = useFileSourceSheet({
    accept,
    multiple: true,
    limit: room,
    onPicked: (files) => {
      let message: string | undefined;
      const added: PickedFile[] = [];
      for (const file of files) {
        const isDuplicate = [...value, ...added].some((existing) => existing.uri === file.uri);
        const rejection = isDuplicate ? null : rejectFile(file, { accept, maxSizeMB });
        if (rejection === 'type') {
          message ??= t(($) => $.filePicker.errorType);
        } else if (rejection === 'size') {
          message ??= t(($) => $.filePicker.errorSize, { max: maxSizeMB });
        } else if (!isDuplicate) {
          added.push(file);
        }
      }
      const kept = room === undefined ? added : added.slice(0, room);
      if (kept.length < added.length) {
        message ??= t(($) => $.filePicker.maxFiles, { max: maxFiles });
      }
      setValidationText(message);
      if (kept.length > 0) {
        onChange([...value, ...kept]);
      }
    },
  });

  return {
    ...sheet,
    validationText,
    isFull: room === 0,
    onRemove: (index: number) => {
      setValidationText(undefined);
      onChange(value.filter((_, position) => position !== index));
    },
  };
}
