import { useTranslation } from 'react-i18next';

import { Box } from '@shared/components/Box';
import { Text } from '@shared/components/Text';
import { TextField } from '@shared/components/TextField';

import { styles } from './styles';
import type { TextAreaProps } from './types';
import { useTextArea } from './useTextArea';

const DEFAULT_MAX_LENGTH = 250;
const DEFAULT_LINES = 4;

/** Multiline `TextField` with a character limit and an `n/max` counter. */
export function TextArea({
  maxLength = DEFAULT_MAX_LENGTH,
  numberOfLines = DEFAULT_LINES,
  value,
  defaultValue,
  onChangeText,
  testID,
  ...rest
}: TextAreaProps) {
  const { t } = useTranslation();
  const { length, ...handlers } = useTextArea({ value, defaultValue, onChangeText });

  return (
    <Box style={styles.root}>
      <TextField
        {...rest}
        multiline
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        testID={testID}
        onChangeText={handlers.onChangeText}
      />
      <Text
        testID={testID ? `${testID}.counter` : undefined}
        variant="caption"
        color="textSecondary"
        style={styles.counter}
        accessibilityLabel={t(($) => $.field.characterCount, { current: length, max: maxLength })}
      >
        {`${String(length)}/${String(maxLength)}`}
      </Text>
    </Box>
  );
}
