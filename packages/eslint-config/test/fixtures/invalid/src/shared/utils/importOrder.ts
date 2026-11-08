import { Shape } from './typeSource';
import { readFileSync } from 'node:fs';

export const read = (name: string, shape?: Shape) => [readFileSync(name), shape];
