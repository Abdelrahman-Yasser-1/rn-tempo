const WINDOW_MS = 60_000;
const SAMPLES = 1000;

export interface EndpointStats {
  id: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
}

export interface StatsSnapshot {
  requestsPerMinute: number;
  total: number;
  errors: number;
  /** Share of requests that answered 400 or more, 0 to 1. */
  errorRate: number;
  endpoints: EndpointStats[];
}

/** The nearest-rank percentile of a list of numbers (0 for an empty one). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;
}

interface PerEndpoint {
  count: number;
  errors: number;
  samples: number[];
}

/** Request counts and latencies since the engine started. Latencies keep the last 1000 samples per endpoint. */
export class Stats {
  private readonly now: () => number;
  private recent: number[] = [];
  private total = 0;
  private errors = 0;
  private readonly perEndpoint = new Map<string, PerEndpoint>();

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  record(endpointId: string | undefined, status: number, ms: number): void {
    const at = this.now();
    this.recent.push(at);
    this.total += 1;
    const failed = status >= 400;
    if (failed) this.errors += 1;
    const key = endpointId ?? '(unmatched)';
    const entry = this.perEndpoint.get(key) ?? { count: 0, errors: 0, samples: [] };
    entry.count += 1;
    if (failed) entry.errors += 1;
    entry.samples.push(ms);
    if (entry.samples.length > SAMPLES) entry.samples.shift();
    this.perEndpoint.set(key, entry);
    this.trim(at);
  }

  private trim(at: number): void {
    const cutoff = at - WINDOW_MS;
    let drop = 0;
    while (drop < this.recent.length && (this.recent[drop] ?? 0) <= cutoff) drop += 1;
    if (drop > 0) this.recent = this.recent.slice(drop);
  }

  snapshot(): StatsSnapshot {
    this.trim(this.now());
    return {
      requestsPerMinute: this.recent.length,
      total: this.total,
      errors: this.errors,
      errorRate: this.total === 0 ? 0 : this.errors / this.total,
      endpoints: [...this.perEndpoint]
        .map(([id, entry]) => ({ id, count: entry.count, errors: entry.errors, p50: percentile(entry.samples, 50), p95: percentile(entry.samples, 95) }))
        .sort((a, b) => b.p95 - a.p95 || a.id.localeCompare(b.id)),
    };
  }
}
