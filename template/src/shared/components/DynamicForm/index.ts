// The public API of the dynamic forms module: the only import path outside this folder.
export { DynamicFormFlowScreen } from '@shared/components/DynamicForm/screens/DynamicFormFlowScreen';
export { FormBuilder } from '@shared/components/DynamicForm/components/FormBuilder';
export type {
  FormBuilderProps,
  FormBuilderRef,
} from '@shared/components/DynamicForm/components/FormBuilder';
export { FormFlow } from '@shared/components/DynamicForm/components/FormFlow';
export type { FormFlowProps } from '@shared/components/DynamicForm/components/FormFlow';
export { MultiStepFormBuilder } from '@shared/components/DynamicForm/components/MultiStepFormBuilder';
export type {
  MultiStepFormBuilderProps,
  MultiStepFormBuilderRef,
  NavigationProps,
} from '@shared/components/DynamicForm/components/MultiStepFormBuilder';
export {
  fieldRenderers,
  renderField,
} from '@shared/components/DynamicForm/components/FieldRegistry';
export type {
  BoundFormField,
  FieldRenderArgs,
  FieldRendererMap,
  FieldTypeMap,
  FormField,
  GroupFieldConfig,
  RepeatFieldConfig,
  RepeatItemField,
  ResolvedTexts,
  RowFieldConfig,
  StepConfig,
} from '@shared/components/DynamicForm/components/FieldRegistry';
export { useBuilderForm } from '@shared/components/DynamicForm/hooks/useBuilderForm';
export type { BaseBuilderProps } from '@shared/components/DynamicForm/hooks/useBuilderForm';
export { useFormText } from '@shared/components/DynamicForm/hooks/useFormText';
export { buildZodSchema } from '@shared/components/DynamicForm/utils/buildZodSchema';
export { evaluateCondition } from '@shared/components/DynamicForm/utils/conditions';
export type { Condition } from '@shared/components/DynamicForm/utils/conditions';
export { defineFlow, fromJson } from '@shared/components/DynamicForm/utils/fromJson';
export { parseFormJson } from '@shared/components/DynamicForm/utils/jsonDocument';
export type {
  FlowJson,
  FormSchemaJson,
  ParseResult,
} from '@shared/components/DynamicForm/utils/jsonDocument';
export { VALIDATION_MESSAGES } from '@shared/components/DynamicForm/utils/messages';
export type { PatternName } from '@shared/components/DynamicForm/utils/patterns';
export { createFormResolver } from '@shared/components/DynamicForm/utils/formResolver';
export type { FormResolverOptions } from '@shared/components/DynamicForm/utils/formResolver';
export {
  clearAllDrafts,
  discardDraft,
  hasDraft,
  initDraftCleanup,
} from '@shared/components/DynamicForm/drafts/drafts';
export type { DraftAuthSource } from '@shared/components/DynamicForm/drafts/drafts';
export type {
  BuiltForm,
  DraftConfig,
  DynamicFormFlowParams,
  FieldBehaviors,
  FieldTexts,
  FieldVisibility,
  FormChangeEvent,
  FormOption,
  FormSpacing,
  FormText,
  FromJsonResult,
  LocalizedText,
  ReValidationMode,
  StepDirection,
  ValidationMode,
} from '@shared/components/DynamicForm/types';
