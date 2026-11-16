import { expect, it } from 'vitest';
import * as api from '../src/index.ts';

it('loads the package entry', () => {
  expect(api).toBeDefined();
});
