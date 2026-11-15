import { draftStore } from './drafts';

describe('draftStore', () => {
  it('AC-1: starts empty', () => {
    expect(draftStore.size).toBe(0);
  });
});
