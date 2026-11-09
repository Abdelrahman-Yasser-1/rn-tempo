import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useFormText } from './useFormText';

describe('useFormText', () => {
  it('translates a forms key, a namespaced key and a localized object', async () => {
    const { result } = await renderHookWithProviders(() => useFormText());
    expect(result.current('validation.required')).toBe('This field is required.');
    expect(result.current({ en: 'Name', ar: 'الاسم' })).toBe('Name');
    expect(result.current(undefined)).toBeUndefined();
  });

  it('follows the active language for localized objects', async () => {
    const { result } = await renderHookWithProviders(() => useFormText(), { language: 'ar' });
    expect(result.current({ en: 'Name', ar: 'الاسم' })).toBe('الاسم');
    expect(result.current('validation.required')).toBe('هذا الحقل مطلوب.');
  });
});
