import type { Loss } from '../api/types';

import { ConfirmDialog } from './ConfirmDialog';

export function describeLoss(item: Loss): string {
  const rows = (count: number, noun: string, plural = `${noun}s`): string => `${String(count)} ${count === 1 ? noun : plural}`;
  switch (item.kind) {
    case 'collection':
      return `The collection "${item.collection}" and its ${rows(item.rows, 'record')}`;
    case 'field':
      return `The field "${item.collection}.${item.field ?? ''}" and its ${rows(item.rows, 'saved value')}`;
    case 'contentType':
      return `The content type "${item.collection}" and its ${rows(item.rows, 'entry', 'entries')}`;
    case 'contentField':
      return `The content field "${item.collection}.${item.field ?? ''}" and its ${rows(item.rows, 'saved value')}`;
    case 'contentLocale':
      return item.locale === undefined
        ? `The translations of "${item.collection}" in every language but the default (${rows(item.rows, 'translation')})`
        : `Everything written in the language "${item.locale}" (${rows(item.rows, 'translation')})`;
  }
}

/** The second confirm of a destructive change: the engine's own list of what would be lost. */
export function LossDialog({ message, items, busy, onConfirm, onCancel }: { message: string; items: Loss[]; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog title="This deletes data" confirmLabel="Delete it" busy={busy} onCancel={onCancel} onConfirm={onConfirm}>
      <p>{message}</p>
      {items.length === 0 ? null : (
        <>
          <p>What would be lost:</p>
          <ul>
            {items.map((item, index) => (
              <li key={index}>{describeLoss(item)}</li>
            ))}
          </ul>
        </>
      )}
      <p className="warning">This cannot be undone.</p>
    </ConfirmDialog>
  );
}
