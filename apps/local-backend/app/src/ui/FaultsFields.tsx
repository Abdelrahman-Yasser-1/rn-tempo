import { Hint } from './bits';
import type { FaultKey, FaultsForm, OfflineMode } from '../lib/endpointFaults';

const SAME = 'Same as the backend';

/** The faults of one endpoint. Every setting is "same as the backend" (left out) or its own value. */
export function FaultsFields({ form, onChange }: { form: FaultsForm; onChange: (form: FaultsForm) => void }) {
  const set = (patch: Partial<FaultsForm>): void => {
    onChange({ ...form, ...patch });
  };
  const text = (label: string, key: 'failureRate' | 'failureStatus' | 'dropRate' | 'slowUpload' | 'slowDownload') => (
    <label>
      {label}
      <input
        className="short"
        inputMode="numeric"
        placeholder="Same"
        value={form[key]}
        onChange={(event) => {
          set({ [key]: event.target.value });
        }}
      />
    </label>
  );
  return (
    <div className="stack tight">
      <div className="row">
        <label>
          Rate limit
          <select
            value={form.limit}
            onChange={(event) => {
              set({ limit: event.target.value as FaultsForm['limit'] });
            }}
          >
            <option value="inherit">{SAME}</option>
            <option value="off">Off for this endpoint</option>
            <option value="own">Own limit</option>
          </select>
        </label>
        {form.limit === 'own' ? (
          <>
            <label>
              Requests
              <input
                className="short"
                inputMode="numeric"
                value={form.requests}
                onChange={(event) => {
                  set({ requests: event.target.value });
                }}
              />
            </label>
            <label>
              Per seconds
              <input
                className="short"
                inputMode="numeric"
                value={form.perSeconds}
                onChange={(event) => {
                  set({ perSeconds: event.target.value });
                }}
              />
            </label>
            <label>
              Counted by
              <select
                value={form.key}
                onChange={(event) => {
                  set({ key: event.target.value as FaultKey });
                }}
              >
                <option value="ip">Client address</option>
                <option value="user">Signed-in user</option>
                <option value="global">Everybody together</option>
              </select>
            </label>
          </>
        ) : null}
      </div>
      <div className="row">
        {text('Failure rate (%)', 'failureRate')}
        {text('Failure status', 'failureStatus')}
        {text('Dropped connections (%)', 'dropRate')}
        <label>
          Offline
          <select
            value={form.offline}
            onChange={(event) => {
              set({ offline: event.target.value as OfflineMode });
            }}
          >
            <option value="inherit">{SAME}</option>
            <option value="on">On (refuse every connection)</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>
      <div className="row">
        {text('Upload speed (kbps)', 'slowUpload')}
        {text('Download speed (kbps)', 'slowDownload')}
        <span className="muted">
          Leave a box empty to use the backend's. <Hint text="A custom failure body is not in this form. Set a custom failure body in the JSON tab; it is kept as it is." />
        </span>
      </div>
    </div>
  );
}
