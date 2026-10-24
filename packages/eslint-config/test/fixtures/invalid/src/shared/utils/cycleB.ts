import { fromA } from './cycleA';

export const fromB: () => number = () => fromA() + 1;
