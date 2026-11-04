import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { Tooltip } from '../Tooltip';

import { styles } from './styles';
import type { FieldLabelProps } from './types';
import { useFieldLabel } from './useFieldLabel';

/** Label of a form field: required marker, sub label and an optional tooltip hint. */
export function FieldLabel({
  label,
  required: isRequired = false,
  subLabel,
  tooltip,
  testID,
}: FieldLabelProps) {
  const { t } = useTranslation();
  const { isHintOpen, onHintVisibleChange } = useFieldLabel();
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
          <Tooltip
            testID={suffix('tooltip')}
            content={tooltip}
            visible={isHintOpen}
            onVisibleChange={onHintVisibleChange}
            accessibilityLabel={t(isHintOpen ? 'field.hideHint' : 'field.showHint')}
          >
            <Box p="sm">
              <Icon name="info" size="sm" color="textSecondary" />
            </Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
