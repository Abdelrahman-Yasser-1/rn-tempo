import { PRESETS, blankLatency, type LatencyForm, type NetworkForm } from '../lib/network';

/** The delay of a backend or an endpoint: none (or the backend's), a fixed time, or a random one in a range. */
export function LatencyFields({ form, onChange, inheritLabel }: { form: LatencyForm; onChange: (form: LatencyForm) => void; inheritLabel?: string }) {
  const set = (patch: Partial<LatencyForm>): void => {
    onChange({ ...form, ...patch });
  };
  return (
    <div className="row">
      <label>
        Delay
        <select
          value={form.mode}
          onChange={(event) => {
            onChange({ ...blankLatency(event.target.value as LatencyForm['mode']), fixed: form.fixed, min: form.min, max: form.max });
          }}
        >
          {inheritLabel === undefined ? <option value="none">No delay</option> : <option value="inherit">{inheritLabel}</option>}
          <option value="fixed">A fixed time</option>
          <option value="range">A random time in a range</option>
        </select>
      </label>
      {form.mode === 'fixed' ? (
        <label>
          Wait (ms)
          <input
            className="short"
            inputMode="numeric"
            value={form.fixed}
            onChange={(event) => {
              set({ fixed: event.target.value });
            }}
          />
        </label>
      ) : null}
      {form.mode === 'range' ? (
        <>
          <label>
            Shortest (ms)
            <input
              className="short"
              inputMode="numeric"
              value={form.min}
              onChange={(event) => {
                set({ min: event.target.value });
              }}
            />
          </label>
          <label>
            Longest (ms)
            <input
              className="short"
              inputMode="numeric"
              value={form.max}
              onChange={(event) => {
                set({ max: event.target.value });
              }}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

/** A network preset, with the speeds and timeout it can be given. `inheritLabel` adds "same as the backend" (an endpoint). */
export function NetworkFields({ form, onChange, inheritLabel }: { form: NetworkForm; onChange: (form: NetworkForm) => void; inheritLabel?: string }) {
  const set = (patch: Partial<NetworkForm>): void => {
    onChange({ ...form, ...patch });
  };
  const detail = PRESETS.find((preset) => preset.value === form.preset)?.detail;
  return (
    <div className="stack tight">
      <div className="row">
        <label>
          Network
          <select
            value={form.preset}
            onChange={(event) => {
              set({ preset: event.target.value as NetworkForm['preset'] });
            }}
          >
            {inheritLabel === undefined ? null : <option value="inherit">{inheritLabel}</option>}
            {PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        {form.preset === 'inherit' ? null : (
          <>
            <label>
              Download (kbps, optional)
              <input
                className="short"
                inputMode="numeric"
                value={form.down}
                onChange={(event) => {
                  set({ down: event.target.value });
                }}
              />
            </label>
            <label>
              Upload (kbps, optional)
              <input
                className="short"
                inputMode="numeric"
                value={form.up}
                onChange={(event) => {
                  set({ up: event.target.value });
                }}
              />
            </label>
          </>
        )}
        {form.preset === 'timeout' || form.preset === 'custom' ? (
          <label>
            Timeout after (ms, optional)
            <input
              className="short"
              inputMode="numeric"
              placeholder={form.preset === 'timeout' ? '30000' : ''}
              value={form.timeout}
              onChange={(event) => {
                set({ timeout: event.target.value });
              }}
            />
          </label>
        ) : null}
      </div>
      {detail === undefined ? null : <span className="muted">{detail}</span>}
    </div>
  );
}
