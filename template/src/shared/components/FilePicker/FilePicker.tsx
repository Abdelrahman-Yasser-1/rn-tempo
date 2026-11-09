import { useTranslation } from 'react-i18next';

import { Box } from '@shared/components/Box';
import { FileRow } from '@shared/components/FileRow';
import { FileSourceSheet } from '@shared/components/FileSourceSheet';
import { PickerField } from '@shared/components/PickerField';

import type { FilePickerProps } from './types';
import { useFilePicker } from './useFilePicker';

/**
 * File field: a trigger that opens a sheet with Camera, Photos and Files, then shows the chosen
 * file's name, size and a remove button. Files over `maxSizeMB` or outside `accept` are refused
 * with an error message. The native pickers are reached through `@services/files`.
 */
export function FilePicker({
  value,
  onChange,
  accept,
  maxSizeMB,
  placeholder,
  sheetTitle,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  testID,
}: FilePickerProps) {
  const { t } = useTranslation();
  const vm = useFilePicker({ onChange, accept, maxSizeMB });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const file = value ?? undefined;
  const canEdit = !isDisabled && !isReadOnly;

  return (
    <Box gap="sm">
      <PickerField
        label={label}
        required={isRequired}
        subLabel={subLabel}
        tooltip={tooltip}
        helperText={helperText}
        errorText={errorText ?? vm.validationText}
        disabled={isDisabled || vm.isPicking}
        readOnly={isReadOnly}
        valueText={file === undefined ? undefined : t(($) => $.filePicker.replace)}
        placeholder={placeholder ?? t(($) => $.filePicker.placeholder)}
        icon="paperclip"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      {file !== undefined && (
        <FileRow file={file} onRemove={canEdit ? vm.onRemove : undefined} testID={suffix('file')} />
      )}
      <FileSourceSheet
        visible={vm.isOpen}
        sources={vm.sources}
        title={sheetTitle ?? label}
        testID={suffix('sheet')}
        onSelect={vm.onSelect}
        onClose={vm.onClose}
      />
    </Box>
  );
}
