import { isImageType } from '@services/files/fileRules';

import { Box } from '../Box';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import type { FileRowProps } from './types';
import { useFileRow } from './useFileRow';

/** One picked file: an icon for its kind, the name, the size and an optional remove button. */
export function FileRow({ file, onRemove, testID }: FileRowProps) {
  const { sizeText, removeLabel } = useFileRow({ file });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <Box
      direction="row"
      align="center"
      gap="md"
      px="md"
      py="sm"
      bg="surface"
      radius="md"
      testID={testID}
    >
      <Icon name={isImageType(file.type) ? 'photo' : 'file'} color="textSecondary" />
      <Box flex={1}>
        <Text numberOfLines={1} testID={suffix('name')}>
          {file.name}
        </Text>
        <Text variant="caption" color="textSecondary" testID={suffix('size')}>
          {sizeText}
        </Text>
      </Box>
      {onRemove !== undefined && (
        <IconButton
          icon="close"
          size="sm"
          accessibilityLabel={removeLabel}
          testID={suffix('remove')}
          onPress={onRemove}
        />
      )}
    </Box>
  );
}
