import type { ChangeChoice, ImportChoices, ImportDiff } from '../api/types';

/**
 * What an import does when nobody changes anything: add every new endpoint, take the changes to endpoints that were
 * never edited, keep the ones that were edited, and delete nothing.
 */
export function defaultChoices(diff: ImportDiff): ImportChoices {
  return {
    add: Object.fromEntries(diff.added.map((entry) => [entry.id, true])),
    remove: Object.fromEntries(diff.removed.map((entry) => [entry.id, false])),
    change: Object.fromEntries(diff.changed.map((entry): [string, ChangeChoice] => [entry.id, entry.customized === true ? 'keep-mine' : 'take-new'])),
  };
}

export const setAll = <T,>(record: Record<string, T>, value: T): Record<string, T> => Object.fromEntries(Object.keys(record).map((key) => [key, value]));

export function countChoices(choices: ImportChoices): { added: number; removed: number; changed: number } {
  return {
    added: Object.values(choices.add).filter(Boolean).length,
    removed: Object.values(choices.remove).filter(Boolean).length,
    changed: Object.values(choices.change).filter((choice) => choice !== 'keep-mine').length,
  };
}
