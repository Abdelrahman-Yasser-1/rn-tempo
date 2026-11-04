import {
  acceptsImages,
  availableSources,
  isImageType,
  matchesAccept,
  rejectFile,
  splitFileSize,
} from './fileRules';

describe('matchesAccept', () => {
  test('accepts everything without rules', () => {
    expect(matchesAccept('application/zip')).toBe(true);
    expect(matchesAccept('application/zip', [])).toBe(true);
  });

  test('matches exact types and wildcards, ignoring case', () => {
    expect(matchesAccept('application/pdf', ['application/pdf'])).toBe(true);
    expect(matchesAccept('IMAGE/PNG', ['image/*'])).toBe(true);
    expect(matchesAccept('text/plain', ['image/*', 'application/pdf'])).toBe(false);
    expect(matchesAccept('text/plain', ['*/*'])).toBe(true);
  });
});

describe('sources', () => {
  test('offers the camera and library only when images are accepted', () => {
    expect(availableSources()).toEqual(['camera', 'library', 'files']);
    expect(availableSources(['image/png'])).toEqual(['camera', 'library', 'files']);
    expect(availableSources(['application/pdf'])).toEqual(['files']);
    expect(acceptsImages(['application/pdf', 'image/*'])).toBe(true);
  });

  test('tells images apart', () => {
    expect(isImageType('image/heic')).toBe(true);
    expect(isImageType('application/pdf')).toBe(false);
  });
});

describe('rejectFile', () => {
  const rules = { accept: ['image/*'], maxSizeMB: 1 };

  test('rejects a wrong type before a wrong size', () => {
    expect(rejectFile({ type: 'application/pdf', size: 5_000_000 }, rules)).toBe('type');
  });

  test('rejects files over the limit and keeps files at it', () => {
    expect(rejectFile({ type: 'image/png', size: 1024 * 1024 + 1 }, rules)).toBe('size');
    expect(rejectFile({ type: 'image/png', size: 1024 * 1024 }, rules)).toBeNull();
    expect(rejectFile({ type: 'image/png', size: 9e9 }, { accept: ['image/*'] })).toBeNull();
  });
});

describe('splitFileSize', () => {
  test.each([
    [0, { value: 0, unit: 'B' }],
    [1023, { value: 1023, unit: 'B' }],
    [1536, { value: 1.5, unit: 'KB' }],
    [5 * 1024 * 1024, { value: 5, unit: 'MB' }],
    [3 * 1024 ** 3, { value: 3, unit: 'GB' }],
  ] as const)('%i bytes', (bytes, expected) => {
    expect(splitFileSize(bytes)).toEqual(expected);
  });
});
