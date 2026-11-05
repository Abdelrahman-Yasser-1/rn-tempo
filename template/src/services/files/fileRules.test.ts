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

  test('supports the bare wildcard and trims and lowercases rules', () => {
    expect(matchesAccept('text/plain', ['*'])).toBe(true);
    expect(matchesAccept('application/pdf', ['  Application/PDF '])).toBe(true);
    expect(matchesAccept('image/svg+xml', [' IMAGE/* '])).toBe(true);
  });

  test('keeps a wildcard to its own top-level type', () => {
    expect(matchesAccept('video/mp4', ['image/*'])).toBe(false);
    expect(matchesAccept('imagery/x', ['image/*'])).toBe(false);
    expect(matchesAccept('application/pdf2', ['application/pdf'])).toBe(false);
  });
});

describe('sources', () => {
  test('offers the camera and library only when images are accepted', () => {
    expect(availableSources()).toEqual(['camera', 'library', 'files']);
    expect(availableSources(['image/png'])).toEqual(['camera', 'library', 'files']);
    expect(availableSources(['application/pdf'])).toEqual(['files']);
    expect(acceptsImages(['application/pdf', 'image/*'])).toBe(true);
  });

  test('offers every source for an empty list, a catch-all or a wildcard', () => {
    expect(availableSources([])).toEqual(['camera', 'library', 'files']);
    expect(availableSources(['*/*'])).toEqual(['camera', 'library', 'files']);
    expect(availableSources(['image/*'])).toEqual(['camera', 'library', 'files']);
  });

  test('offers only the file browser for non-image types', () => {
    expect(acceptsImages(['application/pdf', 'text/plain'])).toBe(false);
    expect(availableSources(['text/plain', 'application/zip'])).toEqual(['files']);
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

  test('checks only the size without an accept list, and only the type without a limit', () => {
    expect(rejectFile({ type: 'text/plain', size: 2 * 1024 * 1024 }, { maxSizeMB: 1 })).toBe(
      'size',
    );
    expect(rejectFile({ type: 'text/plain', size: 10 }, { maxSizeMB: 1 })).toBeNull();
    expect(rejectFile({ type: 'text/plain', size: 10 }, { accept: ['image/*'] })).toBe('type');
    expect(rejectFile({ type: 'text/plain', size: 10 }, {})).toBeNull();
  });

  test('supports fractional limits', () => {
    expect(rejectFile({ type: 'a/b', size: 600_000 }, { maxSizeMB: 0.5 })).toBe('size');
    expect(rejectFile({ type: 'a/b', size: 500_000 }, { maxSizeMB: 0.5 })).toBeNull();
  });
});

describe('splitFileSize', () => {
  test.each([
    [0, { value: 0, unit: 'B' }],
    [1023, { value: 1023, unit: 'B' }],
    [1024, { value: 1, unit: 'KB' }],
    [1536, { value: 1.5, unit: 'KB' }],
    [1024 * 1024, { value: 1, unit: 'MB' }],
    [1.25 * 1024 * 1024, { value: 1.3, unit: 'MB' }],
    [1024 ** 3, { value: 1, unit: 'GB' }],
    [-5, { value: 0, unit: 'B' }],
    [12.6, { value: 13, unit: 'B' }],
    [5 * 1024 * 1024, { value: 5, unit: 'MB' }],
    [3 * 1024 ** 3, { value: 3, unit: 'GB' }],
  ] as const)('%i bytes', (bytes, expected) => {
    expect(splitFileSize(bytes)).toEqual(expected);
  });
});
