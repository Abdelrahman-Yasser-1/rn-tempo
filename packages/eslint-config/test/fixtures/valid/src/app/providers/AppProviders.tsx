import type { ReactNode } from 'react';

/** Wraps the tree with app-level providers. */
export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
