/**
 * The library's own in-memory MMKV (it switches to it under Jest), plus a stateful file table so
 * `existsMMKV` and `deleteMMKV` behave like the native ones: an id exists once an instance was
 * created for it, until it is deleted. Without it the library answers "exists" for every id.
 */
import type * as MMKVApi from 'react-native-mmkv';

const actual = jest.requireActual<typeof MMKVApi>('react-native-mmkv');
const files = new Set<string>();

export const createMMKV: typeof MMKVApi.createMMKV = (configuration) => {
  files.add(configuration?.id ?? 'mmkv.default');
  return actual.createMMKV(configuration);
};

export const existsMMKV: typeof MMKVApi.existsMMKV = (id) => files.has(id);

export const deleteMMKV: typeof MMKVApi.deleteMMKV = (id) => files.delete(id);
