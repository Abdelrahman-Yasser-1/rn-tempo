import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';
import type { TextInputInstance } from 'react-native';

import { Box } from '../Box';
import { Text } from '../Text';

import { styles } from './styles';
import type { OTPInputProps } from './types';

const DEFAULT_LENGTH = 6;

/** Fixed-length one-time-code input: auto-advance, backspace-to-previous and paste/autofill. */
export function OTPInput({
  value,
  onChangeText,
  onComplete,
  length = DEFAULT_LENGTH,
  autoFocus: isAutoFocus = false,
  disabled: isDisabled = false,
  errorText,
  testID,
}: OTPInputProps) {
  const { t } = useTranslation();
  const cellsRef = useRef<(TextInputInstance | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const isInvalid = errorText !== undefined && errorText !== '';
  const cells = Array.from({ length }, (_, index) => index);

  const commit = (next: string, focusIndex: number) => {
    onChangeText(next);
    cellsRef.current[Math.min(focusIndex, length - 1)]?.focus();
    if (next.length === length) {
      onComplete?.(next);
    }
  };

  const handleChange = (index: number, text: string) => {
    const digits = text.replaceAll(/\D/g, '');
    const padded = value.padEnd(index, ' ');
    if (digits === '') {
      commit((padded.slice(0, index) + padded.slice(index + 1)).trimEnd(), index);
      return;
    }
    // More than one digit means a paste or an SMS autofill: spread it from this cell.
    const next = (padded.slice(0, index) + digits + padded.slice(index + digits.length))
      .slice(0, length)
      .trimEnd();
    commit(next, index + digits.length);
  };

  const handleBackspace = (index: number) => {
    if (value[index] === undefined && index > 0) {
      commit(value.slice(0, index - 1), index - 1);
    }
  };

  return (
    <Box style={styles.root}>
      <Box style={styles.row} testID={testID}>
        {cells.map((index) => (
          <OTPCell
            key={`cell-${String(index)}`}
            index={index}
            total={length}
            digit={value[index] ?? ''}
            isFocused={focusedIndex === index}
            isDisabled={isDisabled}
            isInvalid={isInvalid}
            isAutoFocus={isAutoFocus && index === 0}
            testID={testID ? `${testID}.${String(index)}` : undefined}
            label={t('otp.digit', { index: index + 1, total: length })}
            inputRef={(node) => {
              cellsRef.current[index] = node;
            }}
            onChangeText={(text) => {
              handleChange(index, text);
            }}
            onBackspace={() => {
              handleBackspace(index);
            }}
            onFocus={() => {
              setFocusedIndex(index);
            }}
            onBlur={() => {
              setFocusedIndex((current) => (current === index ? null : current));
            }}
          />
        ))}
      </Box>
      {isInvalid && (
        <Text
          testID={testID ? `${testID}.error` : undefined}
          variant="caption"
          color="error"
          align="center"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {errorText}
        </Text>
      )}
    </Box>
  );
}

type OTPCellProps = Readonly<{
  index: number;
  total: number;
  digit: string;
  label: string;
  isFocused: boolean;
  isDisabled: boolean;
  isInvalid: boolean;
  isAutoFocus: boolean;
  testID?: string;
  inputRef: (node: TextInputInstance | null) => void;
  onChangeText: (text: string) => void;
  onBackspace: () => void;
  onFocus: () => void;
  onBlur: () => void;
}>;

function OTPCell({
  digit,
  label,
  isFocused,
  isDisabled,
  isInvalid,
  isAutoFocus,
  testID,
  inputRef,
  onChangeText,
  onBackspace,
  onFocus,
  onBlur,
}: OTPCellProps) {
  const state = { disabled: isDisabled };
  styles.useVariants({ focused: isFocused, invalid: isInvalid, disabled: isDisabled });

  return (
    <TextInput
      ref={inputRef}
      testID={testID}
      style={styles.cell}
      value={digit}
      accessibilityLabel={label}
      accessibilityState={state}
      editable={!isDisabled}
      autoFocus={isAutoFocus}
      keyboardType="number-pad"
      inputMode="numeric"
      textContentType="oneTimeCode"
      autoComplete="sms-otp"
      selectTextOnFocus
      caretHidden
      maxFontSizeMultiplier={1.5}
      onChangeText={onChangeText}
      onKeyPress={(event) => {
        if (event.nativeEvent.key === 'Backspace') {
          onBackspace();
        }
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
