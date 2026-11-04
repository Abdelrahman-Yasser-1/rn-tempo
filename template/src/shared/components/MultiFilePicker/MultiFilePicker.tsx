import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { FileRow } from '../FileRow';
import { FileSourceSheet } from '../FileSourceSheet';
import { PickerField } from '../PickerField';

import type { MultiFilePickerProps } from './types';
import { useMultiFilePicker } from './useMultiFilePicker';

/**
 * Multiple file field: a trigger that opens a sheet with Camera, Photos and Files, then a list of
 * the chosen files with a remove button each. `maxFiles` caps the list (the field disables when
 * it is full); files over `maxSizeMB` or outside `accept` are skipped with an error message.
 */
export function MultiFilePicker({
  value,
  onChange,
  accept,
  maxSizeMB,
  maxFiles,
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
}: MultiFilePickerProps) {
  const { t } = useTranslation();
  const vm = useMultiFilePicker({ value, onChange, accept, maxSizeMB, maxFiles });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const canEdit = !isDisabled && !isReadOnly;
  const countText =
    maxFiles === undefined
      ? undefined
      : t('filePicker.count', { current: value.length, max: maxFiles });

  return (
    <Box gap="sm">
      <PickerField
        label={label}
        required={isRequired}
        subLabel={subLabel}
        tooltip={tooltip}
        helperText={helperText ?? countText}
        errorText={errorText ?? vm.validationText}
        disabled={isDisabled || vm.isPicking || vm.isFull}
        readOnly={isReadOnly}
        placeholder={placeholder ?? t('filePicker.add')}
        icon="paperclip"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      {value.map((file, index) => (
        <FileRow
          key={file.uri}
          file={file}
          onRemove={
            canEdit
              ? () => {
                  vm.onRemove(index);
                }
              : undefined
          }
          testID={suffix(`file.${String(index)}`)}
        />
      ))}
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
