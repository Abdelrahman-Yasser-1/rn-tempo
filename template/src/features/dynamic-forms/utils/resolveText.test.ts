import { resolveText } from './resolveText';

const translate = (key: string) => `t(${key})`;

describe('resolveText', () => {
  it('returns undefined for no text', () => {
    expect(resolveText(translate, 'en', undefined)).toBeUndefined();
  });

  it('translates a string as a key', () => {
    expect(resolveText(translate, 'en', 'demo.name')).toBe('t(demo.name)');
    expect(resolveText(translate, 'en', 'common:ok')).toBe('t(common:ok)');
  });

  it('picks the language of a localized object, falling back to en', () => {
    const text = { en: 'Name', ar: 'الاسم' };
    expect(resolveText(translate, 'en', text)).toBe('Name');
    expect(resolveText(translate, 'ar', text)).toBe('الاسم');
    expect(resolveText(translate, 'ar-EG', text)).toBe('الاسم');
    expect(resolveText(translate, 'fr', text)).toBe('Name');
  });
});
