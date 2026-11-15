import { nextStep } from './steps';

describe('nextStep', () => {
  it('AC-1: adds one', () => {
    expect(nextStep(1)).toBe(2);
  });
});
