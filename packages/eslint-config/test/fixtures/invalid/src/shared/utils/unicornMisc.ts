import { readFileSync } from 'fs';

export const names = ['a', 'b'];
names.forEach((name) => readFileSync(name));

export const dashed = 'a-b-c'.replace(/-/g, '+');

export function nothing() {
  return undefined;
}

export function pick(flag: boolean) {
  let value: number;
  if (flag) {
    value = 1;
  } else {
    value = 2;
  }
  return value;
}
