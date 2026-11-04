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

  it('switches from the start block to a gap exactly where pages begin to be skipped', () => {
    expect(paginationRange(4, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 20]);
    expect(paginationRange(5, 20)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 20]);
  });

  it('switches from the middle to the end block exactly where pages begin to be skipped', () => {
    expect(paginationRange(16, 20)).toEqual([1, 'ellipsis-start', 15, 16, 17, 'ellipsis-end', 20]);
    expect(paginationRange(17, 20)).toEqual([1, 'ellipsis-start', 16, 17, 18, 19, 20]);
  });

  it('widens the window with more siblings', () => {
    expect(paginationRange(10, 30, 2)).toEqual([
      1,
      'ellipsis-start',
      8,
      9,
      10,
      11,
      12,
      'ellipsis-end',
      30,
    ]);
    expect(paginationRange(1, 30, 2)).toEqual([1, 2, 3, 4, 5, 6, 7, 'ellipsis-end', 30]);
  });

  it('shows a single page', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
  });

  it('floors a fractional page count and ignores a negative one', () => {
    expect(paginationRange(1, 3.9)).toEqual([1, 2, 3]);
    expect(paginationRange(1, -2)).toEqual([]);
  });

  it('clamps a page below one', () => {
    expect(paginationRange(-5, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 20]);
  });
});
