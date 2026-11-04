import { paginationRange } from './paginationRange';

describe('paginationRange', () => {
  it('lists every page when they fit', () => {
    expect(paginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns nothing without pages', () => {
    expect(paginationRange(1, 0)).toEqual([]);
  });

  it('collapses the end when near the start', () => {
    expect(paginationRange(1, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 20]);
    expect(paginationRange(3, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 20]);
  });

  it('collapses the start when near the end', () => {
    expect(paginationRange(20, 20)).toEqual([1, 'ellipsis-start', 16, 17, 18, 19, 20]);
  });

  it('collapses both sides in the middle', () => {
    expect(paginationRange(10, 20)).toEqual([1, 'ellipsis-start', 9, 10, 11, 'ellipsis-end', 20]);
  });

  it('clamps a page outside the range', () => {
    expect(paginationRange(99, 20)).toEqual([1, 'ellipsis-start', 16, 17, 18, 19, 20]);
  });
});
