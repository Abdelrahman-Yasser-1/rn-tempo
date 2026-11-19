import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { adminSend } from '../api/client';
import { useApi, useCapabilities } from '../api/context';
import type { BackendStatus, MediaItem, MediaPage, MediaUsage, UploadProgress, UploadSummary } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { formatBytes } from '../lib/format';
import { iconLabel, MEDIA_FILTERS, previewKind } from '../lib/media';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CopyButton } from '../ui/CopyButton';
import { EmptyState, ErrorNote } from '../ui/bits';

/**
 * A preview made only from bytes Rust sent for an image, video or audio file, shown through a `blob:` URL.
 * Anything else (SVG and HTML included) is an icon: no markup from a stored file is ever put in the page.
 */
export function Thumb({ backend, item }: { backend: string; item: MediaItem }) {
  const api = useApi();
  const kind = previewKind(item.mime, item.size);
  const [url, setUrl] = useState<string | null>(null);
  const [wanted, setWanted] = useState(kind === 'image');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!wanted || kind === 'icon') return;
    let cancelled = false;
    let made: string | null = null;
    api
      .mediaPreview(backend, item.id)
      .then((bytes) => {
        if (cancelled) return;
        made = URL.createObjectURL(new Blob([bytes], { type: item.mime }));
        setUrl(made);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [api, backend, item.id, item.mime, kind, wanted]);

  if (kind === 'icon' || failed) {
    return (
      <div className="thumb icon" role="img" aria-label={`${item.originalName} (no preview)`}>
        {iconLabel(item.mime, item.originalName)}
      </div>
    );
  }
  if (url === null) {
    return kind === 'image' ? (
      <div className="thumb icon" aria-hidden="true">
        …
      </div>
    ) : (
      <button
        type="button"
        className="thumb icon"
        onClick={() => {
          setWanted(true);
        }}
      >
        Load {kind}
      </button>
    );
  }
  if (kind === 'image') return <img className="thumb" src={url} alt={item.originalName} />;
  if (kind === 'video') return <video className="thumb" src={url} controls aria-label={item.originalName} />;
  return <audio className="thumb" src={url} controls aria-label={item.originalName} />;
}

/** Files stored by the backend: a grid with previews, upload, download, delete and copy URL. */
export function Media({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const { dropFiles } = useCapabilities();
  const refresh = useRefresh(backend.path);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const route = `/media?limit=60${filter === '' ? '' : `&type=${encodeURIComponent(filter)}`}${q === '' ? '' : `&q=${encodeURIComponent(q)}`}`;
  const page = useAdminQuery<MediaPage>(backend.path, route);
  const usage = useAdminQuery<MediaUsage>(backend.path, '/media/usage');
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  const finished = (summary: UploadSummary | null) => {
    setProgress(null);
    if (summary === null) return;
    setNote(`Uploaded ${String(summary.uploaded)} ${summary.uploaded === 1 ? 'file' : 'files'}.${summary.failed.length > 0 ? ` Not uploaded: ${summary.failed.join('; ')}` : ''}`);
    void refreshRef.current();
  };
  const upload = useMutation({ mutationFn: () => api.uploadMedia(backend.path), onSuccess: finished });
  const dropped = useMutation({ mutationFn: () => api.uploadDropped(backend.path), onSuccess: finished });

  // Files dropped on the window arrive as an event from Rust (it keeps the paths); progress comes the same way.
  const dropRef = useRef(dropped.mutate);
  useEffect(() => {
    dropRef.current = dropped.mutate;
  });
  useEffect(() => {
    const offs: (() => void)[] = [];
    let gone = false;
    void api.onDropped(() => {
      dropRef.current();
    }).then((off) => {
      if (gone) off();
      else offs.push(off);
    });
    void api.onUpload((event) => {
      setProgress(event);
    }).then((off) => {
      if (gone) off();
      else offs.push(off);
    });
    return () => {
      gone = true;
      for (const off of offs) off();
    };
  }, [api]);

  const remove = useMutation({
    mutationFn: (item: MediaItem) => adminSend(api, backend.path, 'DELETE', `/media/${encodeURIComponent(item.id)}`),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const download = useMutation({
    mutationFn: (item: MediaItem) => api.downloadMedia(backend.path, item.id),
    onSuccess: (saved) => {
      if (saved !== null) setNote(`Saved to ${saved}.`);
    },
  });
  const address = (item: MediaItem): string => (item.url.startsWith('/') && backend.scheme !== null && backend.port !== null ? `${backend.scheme}://localhost:${String(backend.port)}${item.url}` : item.url);
  const items = page.data?.items ?? [];

  return (
    <div className="screen" aria-label="Media">
      <div className="row">
        <h2>Media</h2>
        <span className="muted">{usage.data === undefined ? '' : `${formatBytes(usage.data.bytes)} in ${String(usage.data.files)} ${usage.data.files === 1 ? 'file' : 'files'}`}</span>
        <span className="spacer" />
        <button
          type="button"
          className="primary"
          disabled={upload.isPending}
          onClick={() => {
            upload.mutate();
          }}
        >
          Upload files…
        </button>
      </div>
      <div className="row">
        <label>
          <span className="sr-only">Type</span>
          <select
            aria-label="Type"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          >
            {MEDIA_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
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
      </div>
      {dropFiles ? <p className="dropzone muted">Drop files anywhere in this window to upload them.</p> : <p className="muted">Choose Upload files to pick them from this computer.</p>}
      {progress === null ? null : (
        <div role="status" aria-label="Upload progress">
          <progress max={progress.total} value={progress.sent} aria-label={`Uploading ${progress.name}`} /> {progress.name} ({progress.index + 1} of {progress.count})
        </div>
      )}
      {note === null ? null : (
        <p className="ok" role="status">
          {note}
        </p>
      )}
      <ErrorNote error={[upload.error, dropped.error, download.error, page.error].find((item) => item !== null) ?? null} />
      {page.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState>{filter === '' && q === '' ? 'No files yet. Choose Upload files, or drop some here.' : 'No file matches.'}</EmptyState>
      ) : (
        <ul className="media-grid">
          {items.map((item) => (
            <li key={item.id} className="card media-card">
              <Thumb backend={backend.path} item={item} />
              <strong className="name" title={item.originalName}>
                {item.originalName}
              </strong>
              <span className="muted">
                {item.mime} · {formatBytes(item.size)}
              </span>
              <div className="row">
                <CopyButton text={address(item)} label="Copy URL" />
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Download ${item.originalName}`}
                  onClick={() => {
                    download.mutate(item);
                  }}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="ghost bad"
                  aria-label={`Delete ${item.originalName}`}
                  onClick={() => {
                    setDeleting(item);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting === null ? null : (
        <ConfirmDialog
          title="Delete this file?"
          confirmLabel="Delete file"
          busy={remove.isPending}
          onCancel={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            remove.mutate(deleting);
          }}
        >
          <p>
            <strong>{deleting.originalName}</strong> ({formatBytes(deleting.size)}) is deleted for good. Records that point at it will show a missing file.
          </p>
          <ErrorNote error={remove.error === null ? null : errorMessage(remove.error)} />
        </ConfirmDialog>
      )}
    </div>
  );
}
