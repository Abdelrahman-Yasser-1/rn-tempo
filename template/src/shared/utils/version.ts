/**
 * Compares two dotted versions numerically (`1.10.0 > 1.9.9`). Missing parts count as 0, a leading
 * `v` and any `-prerelease`/`+build` suffix are ignored. Returns -1, 0 or 1.
 */
export function versionCompare(first: string, second: string): -1 | 0 | 1 {
  const left = parseParts(first);
  const right = parseParts(second);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }
  return 0;
}

function parseParts(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split(/[+-]/)[0] ?? '';
  return core.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
}
