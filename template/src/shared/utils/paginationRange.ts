export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

const FIXED_SLOTS = 5; // first, last, current-ish block edges and two ellipses

/**
 * Page numbers to show for a pager: always the first and last page, the current page with
 * `siblings` neighbours on each side, and an ellipsis wherever pages are skipped.
 * `page` is 1-based.
 */
export function paginationRange(page: number, pageCount: number, siblings = 1): PageItem[] {
  const total = Math.max(0, Math.floor(pageCount));
  const slots = siblings * 2 + FIXED_SLOTS;
  if (total <= slots) {
    return Array.from({ length: total }, (_unused, index) => index + 1);
  }

  const current = Math.min(Math.max(page, 1), total);
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_unused, index) => from + index);
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const hasStartGap = left > 3;
  const hasEndGap = right < total - 2;
  const edge = siblings * 2 + 3;

  if (!hasStartGap) {
    return [...range(1, edge), 'ellipsis-end', total];
  }
  return hasEndGap
    ? [1, 'ellipsis-start', ...range(left, right), 'ellipsis-end', total]
    : [1, 'ellipsis-start', ...range(total - edge + 1, total)];
}
