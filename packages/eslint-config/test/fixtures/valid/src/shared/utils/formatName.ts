import { API_URL } from '@config/env';

/** Builds a display name; the prefix keeps tests independent from the environment. */
export function formatName(name: string): string {
  return `${API_URL ? 'x' : 'y'}:${name}`;
}
