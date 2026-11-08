import { createMMKV, deleteMMKV, existsMMKV, type MMKV } from 'react-native-mmkv';

import { logger } from '@services/logger/logger';

import type { EncryptionKey } from './encryptionKey';
import { StorageNotReadyError } from './errors';
import { createStorageFacade, type StorageFacade } from './facade';
import { STORAGE_AREA_IDS } from './keys';

/** Named MMKV instances: `app` holds the app data, `cache` holds data that may be wiped at any time. */
export type StorageAreaName = keyof typeof STORAGE_AREA_IDS;

const instances = new Map<StorageAreaName, MMKV>();
const facades = new Map<StorageAreaName, StorageFacade>();

const areaNames = Object.keys(STORAGE_AREA_IDS) as StorageAreaName[];

/**
 * Opens one area. A file that exists while its key had to be created is unreadable (it was
 * written with a key the keychain lost), and so is a file MMKV refuses to open: both are deleted
 * and recreated empty with the current key, and the loss is logged.
 */
function openArea(name: StorageAreaName, { value, isNew }: Readonly<EncryptionKey>): MMKV {
  const id = STORAGE_AREA_IDS[name];
  const open = () => createMMKV({ id, encryptionKey: value, encryptionType: 'AES-256' });
  if (isNew && existsMMKV(id)) {
    logger.warn(`Storage area "${name}" exists but its encryption key was lost, resetting it`);
    deleteMMKV(id);
  }
  try {
    return open();
  } catch (error) {
    logger.warn(`Storage area "${name}" failed to open, resetting it`, error);
    deleteMMKV(id);
    return open();
  }
}

/** Opens every area with the same key; called once by `initStorage`. */
export function openAreas(key: Readonly<EncryptionKey>): void {
  for (const name of areaNames) {
    instances.set(name, openArea(name, key));
  }
}

/** Whether every area is open. */
export function areAreasOpen(): boolean {
  return areaNames.every((name) => instances.has(name));
}

function getInstance(name: StorageAreaName): MMKV {
  const instance = instances.get(name);
  if (!instance) {
    throw new StorageNotReadyError();
  }
  return instance;
}

/** The typed storage API of a named area; throws `StorageNotReadyError` on use before init. */
export function getArea(name: StorageAreaName): StorageFacade {
  let facade = facades.get(name);
  if (!facade) {
    facade = createStorageFacade(() => getInstance(name));
    facades.set(name, facade);
  }
  return facade;
}

/** The raw instances by id for dev tooling (Rozenite inspector). Do not use for app data. */
export function getStoragesForDevTools(): Record<string, MMKV> {
  return Object.fromEntries(areaNames.map((name) => [STORAGE_AREA_IDS[name], getInstance(name)]));
}
