import { expect, it } from 'vitest';
import * as contract from '../src/index.ts';

it('loads the package entry', () => {
  expect(contract).toBeDefined();
});
