import { useState } from 'react';

import type { MediaItem, MediaPage } from '../api/types';
import { useAdminQuery } from '../hooks/lb';
import { formatBytes } from '../lib/format';
import { Thumb } from '../tabs/Media';

import { Modal } from './Modal';
import { EmptyState, ErrorNote } from './bits';

/** Choose one of the files in the Media tab's library. */
function PickDialog({ backend, onPick, onClose }: { backend: string; onPick: (item: MediaItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const page = useAdminQuery<MediaPage>(backend, `/media?limit=60${q === '' ? '' : `&q=${encodeURIComponent(q)}`}`);
  const items = page.data?.items ?? [];
  return (
    <Modal title="Choose a media file" onClose={onClose} wide>
      <label>
        <span className="sr-only">Search by name</span>
        <input
          type="search"
          placeholder="Search by name"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
          }}
        />
      </label>
      <ErrorNote error={page.error} />
      {page.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState>{q === '' ? 'The library is empty. Upload files in the Media tab first.' : 'No file matches.'}</EmptyState>
      ) : (
        <ul className="media-grid">
          {items.map((item) => (
            <li key={item.id} className="card media-card">
              <Thumb backend={backend} item={item} />
              <strong className="name" title={item.originalName}>
                {item.originalName}
              </strong>
              <span className="muted">
                {item.mime} · {formatBytes(item.size)}
              </span>
              <button
                type="button"
                aria-label={`Use ${item.originalName}`}
                onClick={() => {
                  onPick(item);
                }}
              >
                Use this file
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row end">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/** A media field: the chosen file (a thumbnail and its name), Choose and Clear. The value is the media id. */
export function MediaPicker({ backend, label, value, onChange }: { backend: string; label: string; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const chosen = useAdminQuery<MediaItem>(backend, `/media/${encodeURIComponent(value)}`, { enabled: value !== '' });
  return (
    <div className="media-picker" role="group" aria-label={label}>
      {value === '' ? (
        <span className="muted">No file chosen.</span>
      ) : chosen.data === undefined ? (
        <span className="muted">{chosen.isError ? 'This file is missing from the library.' : 'Loading…'}</span>
      ) : (
        <div className="row">
          <div className="picked-thumb">
            <Thumb backend={backend} item={chosen.data} />
          </div>
          <span>{chosen.data.originalName}</span>
        </div>
      )}
      <div className="row">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          {value === '' ? 'Choose file…' : 'Change file…'}
        </button>
        {value === '' ? null : (
          <button
            type="button"
            className="ghost bad"
            onClick={() => {
              onChange('');
            }}
          >
            Clear
          </button>
        )}
      </div>
      {open ? (
        <PickDialog
          backend={backend}
          onClose={() => {
            setOpen(false);
          }}
          onPick={(item) => {
            onChange(item.id);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
