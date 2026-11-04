import type { FileSource, PickedFile } from './types';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;
const BYTES_PER_GB = BYTES_PER_MB * 1024;

export type FileSizeUnit = 'B' | 'KB' | 'MB' | 'GB';

/** Why a picked file was rejected. */
export type FileRejection = 'type' | 'size';

/**
 * Whether a MIME type matches an `accept` list of exact types (`application/pdf`) or wildcards
 * (`image/*`) or the catch-all wildcard. An empty or missing list accepts everything.
 */
export function matchesAccept(type: string, accept?: readonly string[]): boolean {
  if (accept === undefined || accept.length === 0) {
    return true;
  }
  const lower = type.toLowerCase();
  return accept.some((rule) => {
    const pattern = rule.trim().toLowerCase();
    if (pattern === '*/*' || pattern === '*') {
      return true;
    }
    return pattern.endsWith('/*') ? lower.startsWith(pattern.slice(0, -1)) : lower === pattern;
  });
}

/** Whether any rule of `accept` can match an image type (so the camera and photo library make sense). */
export function acceptsImages(accept?: readonly string[]): boolean {
  return accept === undefined || accept.length === 0
    ? true
    : accept.some((rule) => matchesAccept('image/jpeg', [rule]) || rule.startsWith('image/'));
}

/** The sources a field offers: images need the camera and library, anything fits the file browser. */
export function availableSources(accept?: readonly string[]): readonly FileSource[] {
  return acceptsImages(accept) ? ['camera', 'library', 'files'] : ['files'];
}

/** Whether a MIME type is an image. */
export function isImageType(type: string): boolean {
  return type.toLowerCase().startsWith('image/');
}

/** Checks a picked file against `accept` and `maxSizeMB`; returns why it is rejected, or `null`. */
export function rejectFile(
  file: Pick<PickedFile, 'type' | 'size'>,
  { accept, maxSizeMB }: Readonly<{ accept?: readonly string[]; maxSizeMB?: number }>,
): FileRejection | null {
  if (!matchesAccept(file.type, accept)) {
    return 'type';
  }
  return maxSizeMB !== undefined && file.size > maxSizeMB * BYTES_PER_MB ? 'size' : null;
}

/** Splits a byte count into a value (one decimal at most) and the unit that keeps it readable. */
export function splitFileSize(bytes: number): { value: number; unit: FileSizeUnit } {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (bytes >= BYTES_PER_GB) {
    return { value: round(bytes / BYTES_PER_GB), unit: 'GB' };
  }
  if (bytes >= BYTES_PER_MB) {
    return { value: round(bytes / BYTES_PER_MB), unit: 'MB' };
  }
  return bytes >= BYTES_PER_KB
    ? { value: round(bytes / BYTES_PER_KB), unit: 'KB' }
    : { value: Math.max(0, Math.round(bytes)), unit: 'B' };
}
