import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { FieldLabelProps } from './types';
import { useFieldLabel } from './useFieldLabel';

/** Label of a form field: required marker, sub label and an optional inline tooltip hint. */
export function FieldLabel({
  label,
  required: isRequired = false,
  subLabel,
  tooltip,
  testID,
}: FieldLabelProps) {
  const { t } = useTranslation();
  const { isHintOpen, onToggleHint } = useFieldLabel();
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <Box style={styles.root}>
      <Box style={styles.row}>
        <Text testID={testID} variant="label" color="textPrimary">
          {label}
        </Text>
        {isRequired && (
          <Text
            testID={suffix('required')}
            variant="label"
            color="error"
            accessibilityLabel={t('field.required')}
          >
            *
          </Text>
        )}
        {subLabel !== undefined && subLabel !== '' && (
          <Text testID={suffix('subLabel')} variant="caption" color="textSecondary">
            {subLabel}
          </Text>
        )}
        {tooltip !== undefined && tooltip !== '' && (
          <IconButton
            testID={suffix('tooltip')}
            icon="info"
            size="sm"
            accessibilityLabel={t(isHintOpen ? 'field.hideHint' : 'field.showHint')}
            accessibilityState={{ expanded: isHintOpen }}
            onPress={onToggleHint}
          />
        )}
      </Box>
      {isHintOpen && tooltip !== undefined && (
        <Text
          testID={suffix('hint')}
          variant="caption"
          color="textSecondary"
          style={styles.hint}
          accessibilityLiveRegion="polite"
        >
          {tooltip}
        </Text>
      )}
    </Box>
  );
}
