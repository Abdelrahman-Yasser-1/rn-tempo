import { getFlow } from './flows';

describe('getFlow', () => {
  it('finds the demo flows', () => {
    expect(getFlow('demo-code')).toMatchObject({ kind: 'flow', id: 'demo-code', review: true });
    expect(getFlow('demo-json')).toMatchObject({ kind: 'flow', id: 'demo-json', review: true });
  });

  it('returns undefined for an unknown id, including object prototype names', () => {
    expect(getFlow('nope')).toBeUndefined();
    expect(getFlow('constructor')).toBeUndefined();
    expect(getFlow('__proto__')).toBeUndefined();
  });
});
