import type { ParseKeys } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { FormText } from '@shared/components/DynamicForm/types';
import { resolveText } from '@shared/components/DynamicForm/utils/resolveText';

/** Returns a function that translates a `FormText` (a `ns:key`, or `{ en, ar }`). */
export function useFormText(): (text: FormText | undefined) => string | undefined {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  return useCallback(
    (text: FormText | undefined) => resolveText((key) => t(key as ParseKeys), language, text),
    [t, language],
  );
}
