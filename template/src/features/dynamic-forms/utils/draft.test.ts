import { useAuthStore } from '@features/auth';
import type { FormField } from '@features/dynamic-forms/types';
import { initStorage, storage } from '@services/storage/storage';
import { createUser } from '@test-utils/factories/user';

import {
  clearAllDrafts,
  discardDraft,
  getDraftSession,
  hasDraft,
  initDraftCleanup,
  loadDraft,
  mergeValues,
  pickPersistableValues,
  saveDraft,
} from './draft';

type Values = {
  name: string;
  password: string;
  pin: string;
  address: { city: string; secretNote: string };
  people: { name: string; ssn: string }[];
};

const fields: FormField<Values>[] = [
  { type: 'text', name: 'name' },
  { type: 'text', name: 'password', props: { secureTextEntry: true } },
  { type: 'otp', name: 'pin' },
  { type: 'text', name: 'address.city' },
  { type: 'text', name: 'address.secretNote', sensitive: true },
  {
    type: 'repeat',
    name: 'people',
    fields: [
      { type: 'text', name: 'name' },
      { type: 'text', name: 'ssn', sensitive: true },
    ],
  },
];

const values = {
  name: 'Sam',
  password: 'hunter2',
  pin: '123456',
  address: { city: 'Cairo', secretNote: 'gate code 9' },
  people: [{ name: 'Alex', ssn: '123-45' }],
  notDeclared: 'leak',
};

const signIn = (id: number) => {
  useAuthStore.setState({ status: 'signedIn', user: createUser({ id }) });
};
const save = (key = 'unit', step?: number) => {
  saveDraft(key, fields, values, { step, session: getDraftSession() });
};
const rawDraft = (key = 'unit') => storage.getString(`forms.draft.${key}`);

describe('draft storage', () => {
  let stopCleanup: () => void;

  beforeAll(async () => {
    await initStorage();
  });

  beforeEach(() => {
    stopCleanup = initDraftCleanup();
    signIn(1);
  });

  afterEach(() => {
    stopCleanup();
    useAuthStore.setState({ status: 'signedOut', user: null });
    clearAllDrafts();
    jest.restoreAllMocks();
  });

  it('AC-6: keeps only declared fields that are not sensitive or files', () => {
    expect(pickPersistableValues(fields, values)).toEqual({
      name: 'Sam',
      address: { city: 'Cairo' },
      people: [{ name: 'Alex' }],
    });
  });

  it('AC-6: saves and loads a draft with its step, and never writes a sensitive value', () => {
    save('unit', 2);
    const raw = rawDraft() ?? '';
    for (const secret of ['hunter2', '123456', 'gate code', '123-45', 'leak']) {
      expect(raw).not.toContain(secret);
    }
    expect(loadDraft('unit')).toMatchObject({
      v: 1,
      step: 2,
      owner: '1',
      values: { name: 'Sam', address: { city: 'Cairo' }, people: [{ name: 'Alex' }] },
    });
    expect(hasDraft('unit')).toBe(true);
  });

  it('AC-6: discards a draft', () => {
    save();
    discardDraft('unit');
    expect(hasDraft('unit')).toBe(false);
    expect(rawDraft()).toBeUndefined();
  });

  it('ignores a corrupt or outdated draft and a key that is not storage-safe', () => {
    storage.setString('forms.draft.unit', '{not json');
    expect(loadDraft('unit')).toBeUndefined();
    storage.setJSON('forms.draft.unit', { v: 99, savedAt: 1, owner: '1', values: {} });
    expect(loadDraft('unit')).toBeUndefined();
    save('Bad Key!');
    expect(hasDraft('Bad Key!')).toBe(false);
    expect(rawDraft('Bad Key!')).toBeUndefined();
  });

  it('AC-6: sign-out deletes every saved draft', () => {
    save('unit');
    save('unit-b');
    expect(hasDraft('unit')).toBe(true);
    useAuthStore.setState({ status: 'signedOut', user: null });
    expect(rawDraft('unit')).toBeUndefined();
    expect(rawDraft('unit-b')).toBeUndefined();
  });

  it('AC-6: a user change deletes the drafts of the previous user', () => {
    save();
    signIn(2);
    expect(rawDraft()).toBeUndefined();
  });

  it('AC-6: rejects and deletes a draft saved by another user', () => {
    save();
    storage.setJSON('forms.draft.unit', { ...JSON.parse(rawDraft() ?? '{}'), owner: '2' });
    expect(loadDraft('unit')).toBeUndefined();
    expect(rawDraft()).toBeUndefined();
  });

  it('AC-6: rejects a draft saved signed out, and one read while signed out', () => {
    save();
    storage.setJSON('forms.draft.unit', { ...JSON.parse(rawDraft() ?? '{}'), owner: null });
    expect(loadDraft('unit')).toBeUndefined();
    save();
    useAuthStore.setState({ status: 'signedOut', user: null });
    storage.setJSON('forms.draft.unit', {
      v: 1,
      savedAt: Date.now(),
      owner: '1',
      values: {},
    });
    expect(loadDraft('unit')).toBeUndefined();
  });

  it('AC-6: rejects and deletes a draft older than maxAgeMs, 7 days by default', () => {
    const now = Date.now();
    save();
    jest.spyOn(Date, 'now').mockReturnValue(now + 6 * 24 * 60 * 60 * 1000);
    expect(loadDraft('unit')).toBeDefined();
    jest.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
    expect(loadDraft('unit')).toBeUndefined();
    expect(rawDraft()).toBeUndefined();

    jest.spyOn(Date, 'now').mockReturnValue(now);
    save();
    jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
    expect(loadDraft('unit', 1000)).toBeUndefined();
  });

  it('AC-6: a save after sign-out writes nothing', () => {
    const session = getDraftSession();
    useAuthStore.setState({ status: 'signedOut', user: null });
    saveDraft('unit', fields, values, { session });
    expect(rawDraft()).toBeUndefined();
    save();
    expect(rawDraft()).toBeUndefined();
  });

  it('AC-6: a save captured by user A while user B is signed in writes nothing', () => {
    const sessionOfA = getDraftSession();
    signIn(2);
    saveDraft('unit', fields, values, { session: sessionOfA });
    expect(rawDraft()).toBeUndefined();
  });

  it('AC-6: a save that holds an older epoch than the last cleanup writes nothing', () => {
    const session = getDraftSession();
    clearAllDrafts();
    saveDraft('unit', fields, values, { session });
    expect(rawDraft()).toBeUndefined();
    save();
    expect(rawDraft()).toBeDefined();
  });
});

describe('initDraftCleanup', () => {
  beforeAll(async () => {
    await initStorage();
  });

  it('AC-6: sign-out clears drafts even when no form mounted since launch', () => {
    signIn(1);
    // A draft left by a previous run of the app, with no form (and no load or save) this launch.
    storage.setJSON('forms.draft.old', { v: 1, savedAt: Date.now(), owner: '1', values: {} });
    storage.setJSON('forms.draft-index', ['forms.draft.old']);
    const stop = initDraftCleanup();
    useAuthStore.setState({ status: 'signedOut', user: null });
    stop();
    expect(storage.getString('forms.draft.old')).toBeUndefined();
  });
});

describe('mergeValues', () => {
  it('merges objects deeply and lets the override win', () => {
    expect(
      mergeValues<Values>(
        { name: 'A', address: { city: 'X', secretNote: 'n' } },
        {
          address: { city: 'Y' },
          people: [{ name: 'B' }],
        },
      ),
    ).toEqual({ name: 'A', address: { city: 'Y', secretNote: 'n' }, people: [{ name: 'B' }] });
  });

  it('returns the base when there is no override', () => {
    const base = { name: 'A' };
    expect(mergeValues<Values>(base, undefined)).toBe(base);
  });
});
