import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { ContentConfig, ContentFieldDef, ContentTypeDef, EntryDetail, EntryVersion } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { blankLocale, entryBody, entryToForm, fromLocalInput, isBlankLocale, labelOf, missingForPublish, STATUS_WORDS, toLocalInput, whenText, type EntryForm } from '../lib/content';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Markdown } from '../ui/Markdown';
import { MediaPicker } from '../ui/MediaPicker';
import { Modal } from '../ui/Modal';
import { ErrorNote } from '../ui/bits';

type Pending = { kind: 'unpublish' } | { kind: 'delete' } | { kind: 'revert'; version: number } | { kind: 'discard' };

function FieldControl({
  backend,
  field,
  label,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  backend: string;
  field: ContentFieldDef;
  label: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  switch (field.type) {
    case 'text':
      return <textarea rows={4} value={value} placeholder={placeholder} aria-invalid={invalid} onChange={(event) => { onChange(event.target.value); }} />;
    case 'richText':
      return (
        <>
          <textarea className="code-area" rows={8} value={value} placeholder={placeholder} aria-invalid={invalid} onChange={(event) => { onChange(event.target.value); }} />
          {value.trim() === '' ? null : <Markdown source={value} label={`Preview of ${label}`} />}
        </>
      );
    case 'json':
      return <textarea className="code-area" rows={5} value={value} aria-invalid={invalid} onChange={(event) => { onChange(event.target.value); }} />;
    case 'list':
      return <textarea rows={4} value={value} placeholder="One item on each line" aria-invalid={invalid} onChange={(event) => { onChange(event.target.value); }} />;
    case 'boolean':
      return (
        <select value={value} onChange={(event) => { onChange(event.target.value); }}>
          <option value="">(not set)</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case 'enum':
      return (
        <select value={value} onChange={(event) => { onChange(event.target.value); }}>
          <option value="">(none)</option>
          {(field.enumValues ?? []).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      );
    case 'media':
      return <MediaPicker backend={backend} label={label} value={value} onChange={onChange} />;
    default:
      return (
        <input
          value={value}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          placeholder={field.type === 'date' ? '2026-11-17' : placeholder}
          aria-invalid={invalid}
          onChange={(event) => { onChange(event.target.value); }}
        />
      );
  }
}

/** The editor of one entry: a form per language, and the publishing actions. */
function EntryForm({ backend, type, config, initial, onClose }: { backend: string; type: ContentTypeDef; config: ContentConfig; initial: EntryDetail | undefined; onClose: () => void }) {
  const api = useApi();
  const refresh = useRefresh(backend);
  const locales = type.localized === true ? config.locales : [config.defaultLocale];
  const [saved, setSaved] = useState<EntryDetail | undefined>(initial);
  const [form, setForm] = useState<EntryForm>(() => entryToForm(type, locales, initial?.values ?? {}));
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [locale, setLocale] = useState(config.defaultLocale);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(initial?.status === 'scheduled' ? initial.publishAt : null));
  const [pending, setPending] = useState<Pending | null>(null);
  const versions = useAdminQuery<{ items: EntryVersion[] }>(backend, `/content/entries/${String(saved?.id ?? 0)}/versions`, { enabled: saved !== undefined });

  const baseline = JSON.stringify([entryToForm(type, locales, saved?.values ?? {}), saved?.slug ?? '']);
  const dirty = saved === undefined || JSON.stringify([form, slug.trim()]) !== baseline;
  const isNew = saved === undefined;
  const status = saved?.status ?? 'draft';

  const apply = (detail: EntryDetail) => {
    setSaved(detail);
    setForm(entryToForm(type, locales, detail.values));
    setSlug(detail.slug ?? '');
    setScheduleAt(toLocalInput(detail.status === 'scheduled' ? detail.publishAt : null));
  };

  /** Saves the form (a new entry is created). Returns the saved entry, or `null` when the form has problems. */
  const persist = async (): Promise<EntryDetail | null> => {
    const result = entryBody(type, locales, form, slug, saved);
    setProblems(result.problems);
    if (Object.keys(result.problems).length > 0) {
      setError('Fix the highlighted fields first.');
      return null;
    }
    if (saved === undefined) return adminSend<EntryDetail>(api, backend, 'POST', '/content/entries', { type: type.name, ...result.body });
    if (!dirty) return saved;
    return adminSend<EntryDetail>(api, backend, 'PUT', `/content/entries/${String(saved.id)}`, result.body);
  };

  const act = async (work: () => Promise<EntryDetail | null>, message: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const detail = await work();
      if (detail !== null) {
        apply(detail);
        setNote(message);
        await refresh();
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  const post = (action: string, body?: unknown) => async (): Promise<EntryDetail | null> => {
    const detail = await persist();
    return detail === null ? null : adminSend<EntryDetail>(api, backend, 'POST', `/content/entries/${String(detail.id)}/${action}`, body ?? {});
  };

  const saveDraft = () => act(persist, status === 'published' ? 'Changes saved.' : 'Draft saved.');
  const publish = async () => {
    const missing = missingForPublish(type, form, config.defaultLocale);
    if (missing.length > 0) {
      setError(`Fill in ${missing.join(', ')} (${config.defaultLocale}) before publishing.`);
      return;
    }
    await act(post('publish'), 'Published. It is now in the public API.');
  };
  const schedule = async () => {
    const at = fromLocalInput(scheduleAt);
    if (at === null) {
      setError('Pick the date and time to publish.');
      return;
    }
    const missing = missingForPublish(type, form, config.defaultLocale);
    if (missing.length > 0) {
      setError(`Fill in ${missing.join(', ')} (${config.defaultLocale}) before scheduling.`);
      return;
    }
    await act(post('schedule', { publishAt: at }), `Scheduled for ${whenText(at)}.`);
  };
  const confirmPending = () => {
    if (pending === null || saved === undefined) return;
    const done = pending;
    setPending(null);
    if (done.kind === 'unpublish') void act(() => adminSend<EntryDetail>(api, backend, 'POST', `/content/entries/${String(saved.id)}/unpublish`, {}), 'Unpublished. It is hidden from the public API.');
    else if (done.kind === 'revert') void act(() => adminSend<EntryDetail>(api, backend, 'POST', `/content/entries/${String(saved.id)}/revert`, { version: done.version }), `Reverted to version ${String(done.version)}.`);
    else if (done.kind === 'delete') {
      setBusy(true);
      adminSend(api, backend, 'DELETE', `/content/entries/${String(saved.id)}`)
        .then(() => refresh())
        .then(onClose)
        .catch((failure: unknown) => {
          setError(errorMessage(failure));
          setBusy(false);
        });
    } else onClose();
  };
  const close = () => {
    if (dirty && !(isNew && Object.values(form).every(isBlankLocale) && slug.trim() === '')) setPending({ kind: 'discard' });
    else onClose();
  };

  const active = form[locale] ?? blankLocale(type);
  const fallback = form[config.defaultLocale] ?? blankLocale(type);
  const latest = versions.data?.items[0]?.version;
  const title = type.label ?? type.name;
  const publishAt = saved?.publishAt ?? null;

  return (
    <Modal title={isNew ? `New ${title} entry` : `Edit ${title} entry ${String(saved.id)}`} onClose={close} wide>
      <div className="row">
        <span className={`badge ${status}`}>{STATUS_WORDS[status]}</span>
        {status === 'published' && publishAt !== null ? <span className="muted">Live since {whenText(publishAt)}</span> : null}
        {status === 'scheduled' && publishAt !== null ? <span className="muted">Goes live {whenText(publishAt)}</span> : null}
        {isNew ? <span className="muted">Not saved yet</span> : dirty ? <span className="warning">Unsaved changes</span> : null}
      </div>
      <label>
        Slug (a readable address, optional)
        <input
          value={slug}
          placeholder="whats-new"
          onChange={(event) => {
            setSlug(event.target.value);
          }}
        />
      </label>
      {type.localized === true ? (
        <div className="locale-tabs" role="tablist" aria-label="Languages">
          {locales.map((code) => {
            const blank = isBlankLocale(form[code]);
            return (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={locale === code}
                className={blank ? 'missing' : undefined}
                onClick={() => {
                  setLocale(code);
                }}
              >
                {code}
                {code === config.defaultLocale ? ' (default)' : ''}
                {blank ? ' (missing)' : ''}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="stack" role="tabpanel" aria-label={`Fields in ${locale}`}>
        {type.fields.length === 0 ? <p className="empty">This type has no fields yet. Close this and choose Edit type.</p> : null}
        {type.fields.map((field) => {
          const name = labelOf(field);
          const label = `${name}${field.required ? ' *' : ''}`;
          const problem = problems[`${locale}.${field.name}`];
          const shown = locale !== config.defaultLocale && type.localized === true && field.type !== 'media' ? (fallback[field.name] ?? '') : '';
          return (
            <div key={`${locale}-${field.name}`} className="stack tight">
              {field.type === 'media' ? (
                <>
                  <span>{label}</span>
                  <FieldControl backend={backend} field={field} label={name} value={active[field.name] ?? ''} placeholder="" invalid={problem !== undefined} onChange={(value) => { setForm((current) => ({ ...current, [locale]: { ...(current[locale] ?? blankLocale(type)), [field.name]: value } })); }} />
                </>
              ) : (
                <label>
                  {label}
                  <FieldControl backend={backend} field={field} label={name} value={active[field.name] ?? ''} placeholder={shown} invalid={problem !== undefined} onChange={(value) => { setForm((current) => ({ ...current, [locale]: { ...(current[locale] ?? blankLocale(type)), [field.name]: value } })); }} />
                </label>
              )}
              {problem === undefined ? null : <span className="error">{problem}</span>}
            </div>
          );
        })}
      </div>
      {note === null ? null : (
        <p className="ok" role="status">
          {note}
        </p>
      )}
      <ErrorNote error={error} />
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => void saveDraft()}>
          {status === 'published' ? 'Save changes' : 'Save draft'}
        </button>
        {status === 'published' ? null : (
          <button type="button" disabled={busy} onClick={() => void publish()}>
            {status === 'scheduled' ? 'Publish now' : 'Publish'}
          </button>
        )}
        {status === 'published' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPending({ kind: 'unpublish' });
            }}
          >
            Unpublish
          </button>
        ) : null}
        {status === 'scheduled' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPending({ kind: 'unpublish' });
            }}
          >
            Cancel schedule
          </button>
        ) : null}
        <span className="spacer" />
        {isNew ? null : (
          <button
            type="button"
            className="ghost bad"
            disabled={busy}
            onClick={() => {
              setPending({ kind: 'delete' });
            }}
          >
            Delete entry
          </button>
        )}
      </div>
      {status === 'published' ? <p className="muted">This entry is live: saving changes updates the public API at once.</p> : null}
      {status === 'published' ? null : (
        <div className="row">
          <label>
            Publish at
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => {
                setScheduleAt(event.target.value);
              }}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void schedule()}>
            Schedule
          </button>
        </div>
      )}
      {saved === undefined ? null : (
        <section className="stack" aria-label="Versions">
          <h3>Versions (the last {config.versionsKept} are kept)</h3>
          {versions.data === undefined ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="plain versions">
              {versions.data.items.map((item) => (
                <li key={item.version} className="row">
                  <span>
                    Version {item.version} · {item.reason === 'create' ? 'created' : item.reason === 'revert' ? 'reverted' : 'saved'} · {whenText(item.savedAt)}
                  </span>
                  {item.version === latest ? (
                    <span className="muted">current</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Revert to version ${String(item.version)}`}
                      disabled={busy}
                      onClick={() => {
                        setPending({ kind: 'revert', version: item.version });
                      }}
                    >
                      Revert
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="row end">
        <button type="button" onClick={close}>
          Close
        </button>
      </div>

      {pending?.kind === 'unpublish' ? (
        <ConfirmDialog title={status === 'scheduled' ? 'Cancel the schedule?' : 'Unpublish this entry?'} confirmLabel={status === 'scheduled' ? 'Cancel schedule' : 'Unpublish'} onCancel={() => { setPending(null); }} onConfirm={confirmPending}>
          <p>{status === 'scheduled' ? 'The entry goes back to a draft and will not be published at the set time.' : 'The entry disappears from the public API at once. Its content is kept as a draft.'}</p>
        </ConfirmDialog>
      ) : null}
      {pending?.kind === 'revert' ? (
        <ConfirmDialog title={`Revert to version ${String(pending.version)}?`} confirmLabel="Revert" onCancel={() => { setPending(null); }} onConfirm={confirmPending}>
          <p>The texts and the slug of version {pending.version} replace the current ones. The current content stays in the version list, and the status does not change.</p>
          {dirty ? <p className="warning">Your unsaved changes are lost.</p> : null}
        </ConfirmDialog>
      ) : null}
      {pending?.kind === 'delete' ? (
        <ConfirmDialog title="Delete this entry?" confirmLabel="Delete entry" busy={busy} onCancel={() => { setPending(null); }} onConfirm={confirmPending}>
          <p>The entry, its translations and its versions are deleted for good. If it is published it disappears from the public API.</p>
        </ConfirmDialog>
      ) : null}
      {pending?.kind === 'discard' ? (
        <ConfirmDialog title="Discard your changes?" confirmLabel="Discard changes" onCancel={() => { setPending(null); }} onConfirm={confirmPending}>
          <p>You have changes that are not saved. Closing now throws them away.</p>
        </ConfirmDialog>
      ) : null}
    </Modal>
  );
}

/** Opens an entry for editing (loading it first), or a blank form for a new one. */
export function EntryEditor({ backend, type, config, entryId, onClose }: { backend: string; type: ContentTypeDef; config: ContentConfig; entryId: number | null; onClose: () => void }) {
  const loaded = useAdminQuery<EntryDetail>(backend, `/content/entries/${String(entryId ?? 0)}`, { enabled: entryId !== null });
  if (entryId !== null && loaded.data === undefined) {
    return (
      <Modal title="Loading the entry" onClose={onClose}>
        {loaded.isError ? <ErrorNote error={loaded.error} /> : <p className="muted">Loading…</p>}
        <div className="row end">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }
  return <EntryForm backend={backend} type={type} config={config} initial={loaded.data} onClose={onClose} />;
}
