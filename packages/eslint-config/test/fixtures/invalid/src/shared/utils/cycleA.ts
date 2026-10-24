import { fromB } from './cycleB';

export const fromA: () => number = () => fromB() + 1;
