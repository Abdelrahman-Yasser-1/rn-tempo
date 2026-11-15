import { hiddenNamesOfSteps, snapToVisibleStep, visibleStepIndexes } from './steps';

type Values = { skip: boolean; a: string; b: string; c: string };

const steps = [
  { fields: [{ type: 'text' as const, name: 'a' as const }] },
  {
    visibleIf: (values: Values) => !values.skip,
    fields: [{ type: 'text' as const, name: 'b' as const, visibleIf: () => false }],
  },
  { fields: [{ type: 'text' as const, name: 'c' as const }] },
];

describe('steps', () => {
  it('lists the visible steps', () => {
    expect(visibleStepIndexes(steps, { skip: false } as Values)).toEqual([0, 1, 2]);
    expect(visibleStepIndexes(steps, { skip: true } as Values)).toEqual([0, 2]);
  });

  it('snaps a hidden step to the next visible one, else the last', () => {
    expect(snapToVisibleStep(1, [0, 2])).toBe(2);
    expect(snapToVisibleStep(2, [0, 2])).toBe(2);
    expect(snapToVisibleStep(5, [0, 2])).toBe(2);
    expect(snapToVisibleStep(0, [])).toBe(0);
  });

  it('hides every field of a hidden step, and the hidden fields of visible ones', () => {
    expect(hiddenNamesOfSteps(steps, { skip: false } as Values)).toEqual(['b']);
    expect(hiddenNamesOfSteps(steps, { skip: true } as Values)).toEqual(['b']);
  });
});
