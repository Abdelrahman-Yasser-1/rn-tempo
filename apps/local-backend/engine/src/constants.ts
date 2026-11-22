/**
 * Header names and fixed values that clients, tests and the dashboard all rely on. One module, so a name is never
 * spelled twice.
 */

/** `x-tempo-test-mode: 1` makes every delay, throttle and timeout 0 for that request. */
export const TEST_MODE_HEADER = 'x-tempo-test-mode';
/** With test mode on, `x-tempo-test-delays: 1` keeps the configured delays and throttling (a developer's opt-in). */
export const TEST_DELAYS_HEADER = 'x-tempo-test-delays';

/** The clock `{{now}}` shows in test mode (a fixed instant, so a test can assert on it). */
export const TEST_MODE_NOW = '2025-01-01T00:00:00.000Z';
/** The seed of random and fake values in test mode. */
export const TEST_MODE_SEED = 'tempo-test-mode';

/** The longest delay, and the longest hold of the `timeout` preset. Nothing waits longer than this. */
export const MAX_DELAY_MS = 60_000;
export const MAX_TIMEOUT_MS = 120_000;
/** The `timeout` preset holds this long when the definition gives no `timeoutMs`. */
export const DEFAULT_TIMEOUT_MS = 30_000;
