import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

import { fakeAdapter } from './fakeEditor';

// jsdom has no layout, so it does not implement scrolling.
Element.prototype.scrollIntoView = () => undefined;

// Monaco does not run in jsdom: every test gets the textarea adapter, ready at once (no lazy load).
vi.mock('../editor/load', () => ({ loadAdapter: () => Promise.resolve(fakeAdapter), peekAdapter: () => fakeAdapter }));
