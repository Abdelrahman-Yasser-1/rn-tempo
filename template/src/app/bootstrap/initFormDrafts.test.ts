import { useAuthStore } from '@features/auth';
import { initStorage, storage } from '@services/storage/storage';
import { createUser } from '@test-utils/factories/user';

import { initFormDrafts } from './initFormDrafts';

const DRAFT_KEY = 'forms.draft.unit';

describe('initFormDrafts', () => {
  beforeAll(async () => {
    await initStorage();
  });

  afterEach(() => {
    useAuthStore.setState({ status: 'signedOut', user: null });
    storage.remove(DRAFT_KEY);
    storage.remove('forms.draft-index');
  });

  it('clears the saved drafts when the signed-in user signs out', () => {
    useAuthStore.setState({ status: 'signedIn', user: createUser({ id: 1 }) });
    storage.setJSON(DRAFT_KEY, { v: 1, savedAt: Date.now(), owner: '1', values: {} });
    storage.setJSON('forms.draft-index', [DRAFT_KEY]);
    const stop = initFormDrafts();

    useAuthStore.setState({ status: 'signedOut', user: null });
    stop();

    expect(storage.getString(DRAFT_KEY)).toBeUndefined();
  });

  it('keeps the drafts while the same user stays signed in', () => {
    useAuthStore.setState({ status: 'signedIn', user: createUser({ id: 1 }) });
    storage.setJSON(DRAFT_KEY, { v: 1, savedAt: Date.now(), owner: '1', values: {} });
    const stop = initFormDrafts();

    useAuthStore.setState({ status: 'signedIn', user: createUser({ id: 1 }) });
    stop();

    expect(storage.getString(DRAFT_KEY)).toBeDefined();
  });
});
