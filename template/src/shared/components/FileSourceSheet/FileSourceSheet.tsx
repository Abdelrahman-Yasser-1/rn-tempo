import { useTranslation } from 'react-i18next';

import type { IconName } from '@assets/generated/icons.types';
import type { FileSource } from '@services/files/types';

import { ListItem } from '../ListItem';
import { PickerSheet } from '../PickerSheet';

import type { FileSourceSheetProps } from './types';

const ICONS: Record<FileSource, IconName> = {
  camera: 'camera',
  library: 'photo',
  files: 'file',
};

/** Bottom sheet that asks where a file should come from: camera, photo library or file browser. */
export function FileSourceSheet({
  visible: isVisible,
  sources,
  onSelect,
  onClose,
  title,
  testID,
}: FileSourceSheetProps) {
  const { t } = useTranslation();
  const labels: Record<FileSource, string> = {
    camera: t('filePicker.camera'),
    library: t('filePicker.library'),
    files: t('filePicker.browse'),
  };

  return (
    <PickerSheet
      visible={isVisible}
      title={title ?? t('filePicker.sheetTitle')}
      testID={testID}
      onClose={onClose}
    >
      {sources.map((source) => (
        <ListItem
          key={source}
          title={labels[source]}
          leading={{ type: 'icon', name: ICONS[source] }}
          testID={testID ? `${testID}.${source}` : undefined}
          onPress={() => {
            onSelect(source);
          }}
        />
      ))}
    </PickerSheet>
  );
}
