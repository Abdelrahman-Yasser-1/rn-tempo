import { cmsKeys } from './keys';

test('AC-C-1: list keys include locale and limit and single keys include identifier and locale', () => {
  expect(cmsKeys.all).toEqual(['cms']);
  expect(cmsKeys.entries('announcement', { locale: 'en', limit: 2 })).toEqual([
    'cms',
    'entries',
    'announcement',
    { locale: 'en', limit: 2 },
  ]);
  expect(cmsKeys.entry('announcement', 'news', 'fr')).toEqual([
    'cms',
    'entry',
    'announcement',
    'news',
    'fr',
  ]);
});
