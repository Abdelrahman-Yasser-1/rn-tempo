import type { ParseKeys } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { FormText } from '@features/dynamic-forms/types';
import { resolveText } from '@features/dynamic-forms/utils/resolveText';

/** Returns a function that translates a `FormText` (a `forms` key, `ns:key` or `{ en, ar }`). */
export function useFormText(): (text: FormText | undefined) => string | undefined {
  const { t, i18n } = useTranslation('forms');
  const language = i18n.language;
  return useCallback(
    (text: FormText | undefined) =>
      resolveText((key) => t(key as ParseKeys<'forms'>), language, text),
    [t, language],
  );
}
