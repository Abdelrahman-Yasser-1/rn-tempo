// THIS FILE CHANGES PER PROJECT (together with FieldRegistry.tsx): it declares the field types a
// form can use. To add a type: add an entry here and a renderer in FieldRegistry.tsx.
import type { ReactNode } from 'react';

import type { FormCheckboxProps } from '@shared/components/FormCheckbox';
import type { FormDatePickerProps } from '@shared/components/FormDatePicker';
import type { FormFilePickerProps } from '@shared/components/FormFilePicker'; // @tempo-feature:file-picker
import type { FormMapPickerProps } from '@shared/components/FormMapPicker'; // @tempo-feature:maps
import type { FormMonthYearPickerProps } from '@shared/components/FormMonthYearPicker';
import type { FormMultiFilePickerProps } from '@shared/components/FormMultiFilePicker'; // @tempo-feature:file-picker
import type { FormMultiSelectProps } from '@shared/components/FormMultiSelect';
import type { FormNumberInputProps } from '@shared/components/FormNumberInput';
import type { FormOtpInputProps } from '@shared/components/FormOtpInput';
import type { FormPhoneInputProps } from '@shared/components/FormPhoneInput';
import type { FormRadioGroupProps } from '@shared/components/FormRadioGroup';
import type { FormSelectProps } from '@shared/components/FormSelect';
import type { FormSliderProps } from '@shared/components/FormSlider';
import type { FormSwitchProps } from '@shared/components/FormSwitch';
import type { FormTextAreaProps } from '@shared/components/FormTextArea';
import type { FormTextFieldProps } from '@shared/components/FormTextField';
import type { FormTimePickerProps } from '@shared/components/FormTimePicker';
import type { FormTimeSlotProps } from '@shared/components/FormTimeSlot';

/** Text the server may send for a form the app has never seen. */
export type LocalizedText = Readonly<{ en: string; ar: string }>;

/**
 * A label, placeholder or message: a key of the `forms` namespace (or `ns:key`), or an explicit
 * `{ en, ar }` object. Keys are resolved with `t()`, objects by the active language.
 */
export type FormText = string | LocalizedText;

export type FormOption = Readonly<{ value: string; label: FormText; disabled?: boolean }>;

/** Props every field gets from the builder, so a field config does not repeat them in `props`. */
type BuilderProps =
  | 'name'
  | 'control'
  | 'label'
  | 'placeholder'
  | 'helperText'
  | 'subLabel'
  | 'tooltip'
  | 'required'
  | 'disabled'
  | 'testID';

/** The props of a `Form*` component minus the ones the builder controls (and `Extra`). */
type PropsOf<Props, Extra extends PropertyKey = never> = Omit<Props, BuilderProps | Extra>;

/**
 * Field type -> the type-specific part of a field config. `props` is the component's own props
 * (labels and the controlled ones are set on the field itself).
 */
export type FieldTypeMap = {
  text: { props?: PropsOf<FormTextFieldProps> };
  textArea: { props?: PropsOf<FormTextAreaProps> };
  number: { props?: PropsOf<FormNumberInputProps> };
  select: { options: readonly FormOption[]; props?: PropsOf<FormSelectProps, 'options'> };
  multiSelect: {
    options: readonly FormOption[];
    props?: PropsOf<FormMultiSelectProps, 'options'>;
  };
  radioGroup: {
    options: readonly FormOption[];
    props?: PropsOf<FormRadioGroupProps, 'children'>;
  };
  checkbox: { props?: PropsOf<FormCheckboxProps> };
  switch: { props?: PropsOf<FormSwitchProps> };
  slider: { props: PropsOf<FormSliderProps> };
  date: { props?: PropsOf<FormDatePickerProps> };
  time: { props?: PropsOf<FormTimePickerProps> };
  monthYear: { props?: PropsOf<FormMonthYearPickerProps> };
  timeSlot: { props: PropsOf<FormTimeSlotProps> };
  otp: { props?: PropsOf<FormOtpInputProps> };
  phone: { props?: PropsOf<FormPhoneInputProps> };
  // @tempo-feature:file-picker:start
  file: { props?: PropsOf<FormFilePickerProps> };
  multiFile: { props?: PropsOf<FormMultiFilePickerProps> };
  // @tempo-feature:file-picker:end
  // @tempo-feature:maps:start
  map: { props?: PropsOf<FormMapPickerProps> };
  // @tempo-feature:maps:end
};

export type FieldTypeName = keyof FieldTypeMap;

/** The texts of a field, already translated. */
export type ResolvedTexts = Readonly<{
  label?: string;
  placeholder?: string;
  helperText?: string;
  subLabel?: string;
  tooltip?: string;
}>;

/** What a renderer receives for one field. */
export type FieldRenderArgs<K extends FieldTypeName> = Readonly<{
  /** The react-hook-form path, e.g. `email` or `items.0.title`. */
  name: string;
  config: FieldTypeMap[K];
  texts: ResolvedTexts;
  isRequired: boolean;
  isDisabled: boolean;
  testID: string | undefined;
  /** Translates any other text of the field (option labels, for example). */
  resolve: (text: FormText | undefined) => string | undefined;
}>;

/** One renderer per field type; this map is the only place a type is tied to a component. */
export type FieldRendererMap = { [K in FieldTypeName]: (args: FieldRenderArgs<K>) => ReactNode };
